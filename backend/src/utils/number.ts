export function round2(value: number): number {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
