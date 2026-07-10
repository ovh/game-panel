// Monotonic, session-unique ids for client-side list entries (log lines, history
// rows, CLI messages). Used only as React keys, never for ordering or storage —
// `Date.now()`-based ids collided when several entries arrived in the same
// millisecond, which broke React reconciliation (stale/duplicated rows).
let seq = 0;

export function nextId(): number {
  seq += 1;
  return seq;
}
