import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Response } from 'express';
import { getConfig } from '../config.js';
import { authMiddleware, rootOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireBodyObject } from '../utils/httpValidation.js';
import { sendRouteError } from '../utils/routeErrors.js';

// Panel look, set by a Super Admin, in the panel's data folder (branding.json), so it survives rebuilds and updates.
// Reading it needs no login (login page):
// - name: custom panel name shown instead of the "OVHcloud Game Panel" logo (sidebar, login page, browser tab)
// - defaultTheme: the theme of visitors who have not picked one yet
// - loginFooter: the line under the login form (empty = none)
const router = Router();
const MAX_NAME_LENGTH = 40;
const MAX_FOOTER_LENGTH = 200;
export const PANEL_THEMES = ['orange', 'cyan', 'dark', 'light'] as const;
export type PanelTheme = (typeof PANEL_THEMES)[number];
export type Branding = { name: string | null; defaultTheme: PanelTheme; loginFooter: string };

function brandingFile(): string {
    return path.join(getConfig().gamepanelDataDir, 'branding.json');
}

const clean = (raw: unknown) =>
    (typeof raw === 'string' ? raw : '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export async function readBranding(): Promise<Branding> {
    let saved: Record<string, unknown> = {};
    try {
        saved = JSON.parse(await fs.readFile(brandingFile(), 'utf8')) as Record<string, unknown>;
    } catch {
        // nothing saved yet
    }
    const name = clean(saved.name);
    const theme = PANEL_THEMES.includes(saved.defaultTheme as PanelTheme) ? (saved.defaultTheme as PanelTheme) : 'orange';
    return { name: name || null, defaultTheme: theme, loginFooter: clean(saved.loginFooter) };
}

// only the fields that are given change
export async function writeBranding(patch: Record<string, unknown>): Promise<Branding> {
    const next = await readBranding();
    if ('name' in patch) {
        const name = clean(patch.name);
        if (name.length > MAX_NAME_LENGTH) throw Object.assign(new Error(`The name can have at most ${MAX_NAME_LENGTH} characters`), { statusCode: 400 });
        next.name = name || null;
    }
    if ('defaultTheme' in patch) {
        if (!PANEL_THEMES.includes(patch.defaultTheme as PanelTheme)) throw Object.assign(new Error('Unknown theme'), { statusCode: 400 });
        next.defaultTheme = patch.defaultTheme as PanelTheme;
    }
    if ('loginFooter' in patch) {
        const footer = clean(patch.loginFooter);
        if (footer.length > MAX_FOOTER_LENGTH) {
            throw Object.assign(new Error(`The footer can have at most ${MAX_FOOTER_LENGTH} characters`), { statusCode: 400 });
        }
        next.loginFooter = footer;
    }
    const file = brandingFile();
    await fs.writeFile(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await fs.rename(`${file}.tmp`, file);
    return next;
}

// GET /api/branding
router.get('/', async (_req, res: Response) => {
    res.json(await readBranding());
});

// PUT /api/branding  { name?, defaultTheme?, loginFooter? }  (empty name = back to the OVHcloud logo)
router.put('/', authMiddleware, rootOnly, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = requireBodyObject(req.body);
        const statusCode = 400;
        try {
            return res.json(await writeBranding(body));
        } catch (error) {
            if ((error as { statusCode?: number }).statusCode === statusCode) {
                return res.status(statusCode).json({ error: (error as Error).message });
            }
            throw error;
        }
    } catch (error) {
        return sendRouteError(res, error, {
            route: 'ROUTE:BRANDING:UPDATE',
            fallbackMessage: 'Could not save the panel name',
        });
    }
});

export default router;
