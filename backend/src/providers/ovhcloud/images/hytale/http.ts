import type { OAuthTokens } from './types.js';
import { nowIso } from '../../../../utils/time.js';

export function formBody(data: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
        params.set(key, value);
    }
    return params.toString();
}

export async function requestJson(url: string, init: RequestInit): Promise<any> {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(`Hytale request failed: HTTP ${response.status} ${response.statusText} ${JSON.stringify(body ?? {})}`);
    }

    return body;
}

export function normalizeOAuthTokens(body: any): OAuthTokens {
    if (!body?.access_token || !body?.refresh_token) {
        throw new Error('Hytale OAuth response is missing tokens');
    }

    return {
        access_token: String(body.access_token),
        refresh_token: String(body.refresh_token),
        token_type: typeof body.token_type === 'string' ? body.token_type : undefined,
        scope: typeof body.scope === 'string' ? body.scope : undefined,
        access_expires_at: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: nowIso(),
    };
}
