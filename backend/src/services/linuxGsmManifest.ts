import crypto from 'node:crypto';
import { linuxGsmCatalogRepository } from '../database/index.js';
import type { LinuxGsmGameRow } from '../database/repositories/linuxGsmCatalogRepository.js';
import { logError } from '../utils/logger.js';
import { nowIso } from '../utils/time.js';

const LINUXGSM_SERVERLIST_URL =
    'https://raw.githubusercontent.com/GameServerManagers/LinuxGSM/master/lgsm/data/serverlist.csv';

const CACHE_TTL_MS = 120 * 60 * 1000;

type ParsedLinuxGsmGame = Omit<LinuxGsmGameRow, 'fetched_at'>;

function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if (ch === ',' && !inQuotes) {
            cells.push(current);
            current = '';
            continue;
        }

        current += ch;
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
}

function parseServerListCsv(csv: string): ParsedLinuxGsmGame[] {
    const lines = csv
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) throw new Error('LinuxGSM serverlist.csv is empty');

    const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
    const shortnameIndex = header.indexOf('shortname');
    const gameservernameIndex = header.indexOf('gameservername');
    const gamenameIndex = header.indexOf('gamename');
    const osIndex = header.indexOf('os');

    if (shortnameIndex < 0 || gameservernameIndex < 0 || gamenameIndex < 0) {
        throw new Error('LinuxGSM serverlist.csv is missing required columns');
    }

    const games: ParsedLinuxGsmGame[] = [];

    for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        const shortname = cells[shortnameIndex]?.trim();
        const gameservername = cells[gameservernameIndex]?.trim();
        const gamename = cells[gamenameIndex]?.trim();
        const os = osIndex >= 0 ? cells[osIndex]?.trim() || null : null;

        if (!shortname || !gameservername || !gamename) continue;

        games.push({
            shortname,
            gameservername,
            gamename,
            os,
            docker_image: `gameservermanagers/gameserver:${shortname}`,
        });
    }

    if (games.length === 0) throw new Error('LinuxGSM serverlist.csv contains no games');
    return games;
}

async function fetchServerListCsv(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
        response = await fetch(LINUXGSM_SERVERLIST_URL, {
            headers: { accept: 'text/csv,text/plain,*/*' },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`LinuxGSM serverlist fetch failed: HTTP ${response.status}`);
    }

    return response.text();
}

function isCacheFresh(fetchedAt: string | null | undefined): boolean {
    if (!fetchedAt) return false;
    const time = Date.parse(fetchedAt);
    if (!Number.isFinite(time)) return false;
    return Date.now() - time < CACHE_TTL_MS;
}

export async function refreshLinuxGsmManifest(): Promise<void> {
    const csv = await fetchServerListCsv();
    const games = parseServerListCsv(csv);
    const contentHash = crypto.createHash('sha256').update(csv).digest('hex');
    const fetchedAt = nowIso();

    await linuxGsmCatalogRepository.replaceAll({
        sourceUrl: LINUXGSM_SERVERLIST_URL,
        contentHash,
        fetchedAt,
        games,
    });
}

export async function listLinuxGsmCatalog(): Promise<{
    games: LinuxGsmGameRow[];
    meta: {
        sourceUrl: string;
        contentHash: string | null;
        fetchedAt: string;
    };
}> {
    let meta = await linuxGsmCatalogRepository.getMeta();
    let games = await linuxGsmCatalogRepository.listAll();

    if (games.length === 0) {
        try {
            await refreshLinuxGsmManifest();
            meta = await linuxGsmCatalogRepository.getMeta();
            games = await linuxGsmCatalogRepository.listAll();
        } catch (error) {
            throw Object.assign(
                new Error('LinuxGSM catalog is unavailable and no local cache exists'),
                { statusCode: 503 }
            );
        }
    }

    if (!meta) {
        throw Object.assign(new Error('LinuxGSM catalog metadata is unavailable'), { statusCode: 503 });
    }

    return {
        games,
        meta: {
            sourceUrl: meta.source_url,
            contentHash: meta.content_hash,
            fetchedAt: meta.fetched_at,
        },
    };
}

export async function getLinuxGsmGameForInstall(shortname: string): Promise<LinuxGsmGameRow> {
    const normalized = shortname.trim();
    if (!/^[a-z0-9_-]{1,64}$/i.test(normalized)) {
        throw Object.assign(new Error('Invalid LinuxGSM shortname'), { statusCode: 400 });
    }

    const meta = await linuxGsmCatalogRepository.getMeta();
    let cached = await linuxGsmCatalogRepository.findByShortname(normalized);

    if (!cached || !isCacheFresh(meta?.fetched_at)) {
        try {
            await refreshLinuxGsmManifest();
            cached = await linuxGsmCatalogRepository.findByShortname(normalized);
        } catch (error) {
            if (!cached) {
                throw Object.assign(
                    new Error('LinuxGSM manifest is unavailable and no local cache exists'),
                    { statusCode: 503 }
                );
            }

            logError('SERVICE:LINUXGSM_MANIFEST:REFRESH_FALLBACK', error, { shortname: normalized });
        }
    }

    if (!cached) {
        throw Object.assign(new Error(`Unknown LinuxGSM game shortname: ${normalized}`), { statusCode: 400 });
    }

    return cached;
}

export function startLinuxGsmManifestRefreshJob(): { stop: () => void } {
    let stopped = false;

    const run = async () => {
        try {
            await refreshLinuxGsmManifest();
        } catch (error) {
            logError('SERVICE:LINUXGSM_MANIFEST:REFRESH', error);
        }
    };

    void run();

    const timer = setInterval(() => {
        if (!stopped) void run();
    }, CACHE_TTL_MS);

    return {
        stop() {
            stopped = true;
            clearInterval(timer);
        },
    };
}
