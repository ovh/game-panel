export type PooledToken =
    | { kind: 'param'; key: string; value: string }
    | { kind: 'flag'; value: string };

function splitPooledWords(raw: string): string[] {
    const words: string[] = [];
    let current = '';
    let started = false;
    let quoted = false;

    for (const char of String(raw ?? '')) {
        if (char === '"') {
            quoted = !quoted;
            started = true;
            continue;
        }

        if (!quoted && /\s/.test(char)) {
            if (started) {
                words.push(current);
                current = '';
                started = false;
            }
            continue;
        }

        current += char;
        started = true;
    }

    if (started) words.push(current);

    return words;
}

function renderPooledValue(value: string): string {
    return /\s/.test(value) ? `"${value}"` : value;
}

export function parsePooledParams(raw: string): PooledToken[] {
    const words = splitPooledWords(raw);
    const tokens: PooledToken[] = [];

    for (let i = 0; i < words.length; i += 1) {
        const word = words[i];

        if (!word.startsWith('+')) {
            tokens.push({ kind: 'flag', value: word });
            continue;
        }

        const next = words[i + 1];
        if (next !== undefined && !next.startsWith('+')) {
            tokens.push({ kind: 'param', key: word.slice(1), value: next });
            i += 1;
            continue;
        }

        tokens.push({ kind: 'param', key: word.slice(1), value: '' });
    }

    return tokens;
}

export function serializePooledParams(tokens: PooledToken[]): string {
    return tokens
        .map((token) => (token.kind === 'flag' ? token.value : `+${token.key} ${renderPooledValue(token.value)}`.trim()))
        .filter(Boolean)
        .join(' ');
}

export function getPooledParam(tokens: PooledToken[], key: string): string | null {
    for (const token of tokens) {
        if (token.kind === 'param' && token.key === key) return token.value;
    }
    return null;
}

export function setPooledParam(tokens: PooledToken[], key: string, value: string): PooledToken[] {
    const matches = (token: PooledToken) => token.kind === 'param' && token.key === key;

    if (value === '') return tokens.filter((token) => !matches(token));

    const index = tokens.findIndex(matches);
    if (index < 0) return [...tokens, { kind: 'param', key, value }];

    return tokens
        .map((token, position): PooledToken | null => {
            if (!matches(token)) return token;
            return position === index ? { kind: 'param', key, value } : null;
        })
        .filter((token): token is PooledToken => token !== null);
}

export function hasPooledFlag(tokens: PooledToken[], flag: string): boolean {
    return tokens.some((token) => token.kind === 'flag' && token.value.toLowerCase() === flag.toLowerCase());
}

export function setPooledFlag(tokens: PooledToken[], flag: string, present: boolean): PooledToken[] {
    const withoutFlag = tokens.filter(
        (token) => !(token.kind === 'flag' && token.value.toLowerCase() === flag.toLowerCase())
    );

    return present ? [...withoutFlag, { kind: 'flag', value: flag }] : withoutFlag;
}
