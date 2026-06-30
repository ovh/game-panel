// Parse "+key value +key2 "quoted value"" into { key: "value", key2: "quoted value" }
export function parseCs2Params(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  let s = raw.trim();

  while (s.length > 0) {
    if (!s.startsWith('+')) {
      const next = s.indexOf('+', 1);
      if (next === -1) break;
      s = s.slice(next);
      continue;
    }

    // Extract key (everything up to first space or end)
    const spaceIdx = s.indexOf(' ');
    if (spaceIdx === -1) {
      result[s.slice(1)] = '';
      break;
    }
    const key = s.slice(1, spaceIdx);
    s = s.slice(spaceIdx + 1).trimStart();

    if (s.length === 0 || s.startsWith('+')) {
      result[key] = '';
      continue;
    }

    let value: string;
    if (s.startsWith('"')) {
      // Quoted value
      const closeIdx = s.indexOf('"', 1);
      if (closeIdx === -1) {
        value = s.slice(1);
        s = '';
      } else {
        value = s.slice(1, closeIdx);
        s = s.slice(closeIdx + 1).trimStart();
      }
    } else {
      // Unquoted value — read until next +key or end
      const nextPlus = s.indexOf(' +');
      if (nextPlus === -1) {
        value = s;
        s = '';
      } else {
        value = s.slice(0, nextPlus);
        s = s.slice(nextPlus + 1).trimStart();
      }
    }

    result[key] = value;
  }

  return result;
}

// Serialize { key: "value" } back to "+key value +key2 "quoted value""
export function serializeCs2Params(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => {
      const needsQuotes = /\s/.test(v);
      return `+${k} ${needsQuotes ? `"${v}"` : v}`;
    })
    .join(' ');
}
