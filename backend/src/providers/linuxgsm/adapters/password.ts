import { randomInt } from 'node:crypto';

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*_-+=?';

function randomChar(pool: string): string {
    return pool[randomInt(0, pool.length)];
}

function shuffle(chars: string[]): string[] {
    const out = [...chars];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = randomInt(0, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function generateStrongPassword(minLength = 16): string {
    const length = Number.isInteger(minLength) ? Math.max(minLength, 16) : 16;
    const all = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

    const chars: string[] = [
        randomChar(UPPERCASE),
        randomChar(LOWERCASE),
        randomChar(DIGITS),
        randomChar(SYMBOLS),
    ];

    while (chars.length < length) {
        chars.push(randomChar(all));
    }

    return shuffle(chars).join('');
}
