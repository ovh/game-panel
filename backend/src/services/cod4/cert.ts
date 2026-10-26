import tls from 'node:tls';
import { getConfig } from '../../config.js';

// The panel's HTTPS certificate (Traefik / Let's Encrypt): when it expires. Checked at most every few hours.
export type CertInfo = { host: string; validTo: string | null; daysLeft: number | null; issuer: string | null; error?: string };

let cache: { at: number; info: CertInfo } | null = null;

function probe(host: string): Promise<CertInfo> {
    return new Promise((resolve) => {
        const done = (info: CertInfo) => {
            socket.destroy();
            resolve(info);
        };
        const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 4000 }, () => {
            const cert = socket.getPeerCertificate();
            if (!cert?.valid_to) return done({ host, validTo: null, daysLeft: null, issuer: null, error: 'No certificate' });
            const validTo = new Date(cert.valid_to);
            const issuer = cert.issuer ? String(cert.issuer.O ?? cert.issuer.CN ?? '') || null : null;
            done({ host, validTo: validTo.toISOString(), daysLeft: Math.floor((validTo.getTime() - Date.now()) / 86_400_000), issuer });
        });
        socket.on('timeout', () => done({ host, validTo: null, daysLeft: null, issuer: null, error: 'No answer on port 443' }));
        socket.on('error', (error) => done({ host, validTo: null, daysLeft: null, issuer: null, error: error.message }));
    });
}

export async function certificateInfo(): Promise<CertInfo | null> {
    const host = getConfig().domain;
    if (!host) return null;
    if (cache && Date.now() - cache.at < (cache.info.error ? 10 * 60_000 : 6 * 3600_000)) return cache.info;
    const info = await probe(host);
    cache = { at: Date.now(), info };
    return info;
}
