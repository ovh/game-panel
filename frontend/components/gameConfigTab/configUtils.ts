import type { ReleaseConfigFileDefinition } from '../../utils/api';

export interface CatalogGameDefinition {
  shortname: string;
  gameservername: string;
  gamename: string;
  dockerImage: string | null;
  configFiles?: ReleaseConfigFileDefinition[] | string[] | string | null;
  config_files?: ReleaseConfigFileDefinition[] | string[] | string | null;
}

export type ConfigWriteFormat =
  | 'manual'
  | 'ini'
  | 'properties'
  | 'cfg'
  | 'txt'
  | 'json'
  | 'yaml'
  | 'lua'
  | 'toml'
  | 'pz_lua_1'
  | 'sdtd_xml_1'
  | 'pw_ini_1'
  | 'unknown';

export type DbConfigFormatType = string;

export interface DbConfigFileFormatDefinition {
  type?: DbConfigFormatType;
  entrySeparator?: string;
  keyValueSeparator?: string;
  quoteKeys?: boolean;
  quoteValues?: boolean;
  spacesAroundSeparator?: boolean;
  commentPrefixes?: string[];
}

export interface DbConfigKeyFormatDefinition {
  type?: string;
  step?: number;
  entrySeparator?: string;
  keyValueSeparator?: string;
  quoteKeys?: boolean;
  quoteValues?: boolean;
  spacesAroundSeparator?: boolean;
  commentPrefixes?: string[];
}

export type DbConfigFieldType = 'text' | 'select' | 'boolean' | 'number';

export interface DbConfigOption {
  value: string;
  label: string;
}

export interface DbConfigFieldDefinition {
  title?: string;
  type: DbConfigFieldType;
  options: DbConfigOption[];
  description?: string;
  section?: string;
  trueValue?: string;
  falseValue?: string;
  min?: number;
  max?: number;
  format?: DbConfigKeyFormatDefinition;
}

export interface DbConfigFileDefinition {
  path: string;
  format?: DbConfigFileFormatDefinition;
  keys: Record<string, DbConfigFieldDefinition>;
}

export interface VerifiedField {
  key: string;
  title?: string;
  type: DbConfigFieldType;
  options: DbConfigOption[];
  description?: string;
  section?: string;
  trueValue?: string;
  falseValue?: string;
  min?: number;
  max?: number;
  format?: DbConfigKeyFormatDefinition;
  presentInFile: boolean;
}

export interface VerifiedConfigFile {
  declaredPath: string;
  resolvedPath: string;
  format?: DbConfigFileFormatDefinition;
  fields: VerifiedField[];
}

interface KeyValueFormatRuntimeOptions {
  entrySeparator: string;
  keyValueSeparator?: string;
  quoteKeys: boolean;
  quoteValues: boolean;
  spacesAroundSeparator: boolean;
  commentPrefixes: string[];
}

export type BooleanState = 'true' | 'false';
export type BooleanAliasFamily = 'literal' | 'numeric' | 'yesno' | 'onoff' | 'enabled';

export const normalizeConfigPath = (raw: string): string => {
  const cleaned = raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');

  if (!cleaned) return '';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};

const decodeEscapedToken = (raw: string): string =>
  raw
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');

const normalizeBooleanOverride = (rawValue: unknown): boolean | undefined => {
  if (typeof rawValue === 'boolean') return rawValue;

  const normalized = String(rawValue ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
};

const normalizeDbFormatType = (rawType: unknown): DbConfigFormatType | null => {
  const value = String(rawType || '')
    .trim()
    .toLowerCase();
  if (!value) return null;
  return value;
};

const normalizeDbConfigFormat = (rawFormat: unknown): DbConfigFileFormatDefinition | undefined => {
  if (!rawFormat || typeof rawFormat !== 'object') return undefined;

  const type = normalizeDbFormatType((rawFormat as any).type);
  const rawEntrySeparator = String((rawFormat as any).entrySeparator ?? '').trim();
  const rawKeyValueSeparator = String((rawFormat as any).keyValueSeparator ?? '').trim();
  const hasCommentPrefixes = Array.isArray((rawFormat as any).commentPrefixes);
  const rawCommentPrefixes = hasCommentPrefixes
    ? (rawFormat as any).commentPrefixes
        .map((item: unknown) => String(item ?? '').trim())
        .filter(Boolean)
    : [];

  const normalized: DbConfigFileFormatDefinition = {
    entrySeparator: rawEntrySeparator ? decodeEscapedToken(rawEntrySeparator) : undefined,
    keyValueSeparator: rawKeyValueSeparator || undefined,
    quoteKeys: normalizeBooleanOverride((rawFormat as any).quoteKeys),
    quoteValues: normalizeBooleanOverride((rawFormat as any).quoteValues),
    spacesAroundSeparator: normalizeBooleanOverride((rawFormat as any).spacesAroundSeparator),
    commentPrefixes: hasCommentPrefixes ? rawCommentPrefixes : undefined,
  };

  if (type) normalized.type = type;

  return Object.values(normalized).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined
  )
    ? normalized
    : undefined;
};

const normalizeDbKeyFormat = (
  rawFormat: unknown,
  fieldType: DbConfigFieldType
): DbConfigKeyFormatDefinition | undefined => {
  if (!rawFormat || typeof rawFormat !== 'object') return undefined;

  const rawType = String((rawFormat as any).type ?? '')
    .trim()
    .toLowerCase();
  const rawStep = Number((rawFormat as any).step);
  const rawEntrySeparator = String((rawFormat as any).entrySeparator ?? '').trim();
  const rawKeyValueSeparator = String((rawFormat as any).keyValueSeparator ?? '').trim();
  const hasCommentPrefixes = Array.isArray((rawFormat as any).commentPrefixes);
  const rawCommentPrefixes = hasCommentPrefixes
    ? (rawFormat as any).commentPrefixes
        .map((item: unknown) => String(item ?? '').trim())
        .filter(Boolean)
    : [];

  const normalized: DbConfigKeyFormatDefinition = {
    step: fieldType === 'number' && Number.isFinite(rawStep) && rawStep > 0 ? rawStep : undefined,
    entrySeparator: rawEntrySeparator ? decodeEscapedToken(rawEntrySeparator) : undefined,
    keyValueSeparator: rawKeyValueSeparator ? decodeEscapedToken(rawKeyValueSeparator) : undefined,
    quoteKeys: normalizeBooleanOverride((rawFormat as any).quoteKeys),
    quoteValues: normalizeBooleanOverride((rawFormat as any).quoteValues),
    spacesAroundSeparator: normalizeBooleanOverride((rawFormat as any).spacesAroundSeparator),
    commentPrefixes: hasCommentPrefixes ? rawCommentPrefixes : undefined,
  };

  if (fieldType === 'number' && (rawType === 'input' || rawType === 'slider' || rawType === 'sidebar')) {
    normalized.type = rawType;
  }

  return Object.values(normalized).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined
  )
    ? normalized
    : undefined;
};

const buildBooleanFieldOptions = (
  rawTrueValue: unknown,
  rawFalseValue: unknown
): { options: DbConfigOption[]; trueValue: string; falseValue: string } => {
  const trueValue = String(rawTrueValue ?? '').trim() || 'true';
  const falseValue = String(rawFalseValue ?? '').trim() || 'false';

  if (trueValue === falseValue) {
    return {
      options: [
        { value: 'true', label: 'On' },
        { value: 'false', label: 'Off' },
      ],
      trueValue: 'true',
      falseValue: 'false',
    };
  }

  return {
    options: [
      { value: trueValue, label: 'On' },
      { value: falseValue, label: 'Off' },
    ],
    trueValue,
    falseValue,
  };
};

export const parseConfigFilesValue = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return normalizeConfigPath(entry);
        if (entry && typeof entry === 'object' && typeof (entry as any).path === 'string') {
          return normalizeConfigPath((entry as any).path);
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        return parseConfigFilesValue(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    const normalized = normalizeConfigPath(trimmed);
    return normalized ? [normalized] : [];
  }

  return [];
};

export const parseDbConfigFiles = (value: unknown): DbConfigFileDefinition[] => {
  if (!value) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        return parseDbConfigFiles(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    return [];
  }

  if (!Array.isArray(value)) return [];

  const definitions: DbConfigFileDefinition[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;

    const path = normalizeConfigPath(String((entry as any).path || ''));
    if (!path) return;
    const format = normalizeDbConfigFormat((entry as any).format);

    const rawKeys = (entry as any).keys;
    if (!rawKeys || typeof rawKeys !== 'object') return;

    const keys: Record<string, DbConfigFieldDefinition> = {};
    Object.entries(rawKeys as Record<string, unknown>).forEach(([rawKey, rawDefinition]) => {
      const key = String(rawKey || '').trim();
      if (!key || !rawDefinition || typeof rawDefinition !== 'object') return;

      const rawType = String((rawDefinition as any).type || '').toLowerCase();
      const rawMin = Number((rawDefinition as any).min ?? (rawDefinition as any).from);
      const rawMax = Number((rawDefinition as any).max ?? (rawDefinition as any).to);
      const min = Number.isFinite(rawMin) ? rawMin : undefined;
      const max = Number.isFinite(rawMax) ? rawMax : undefined;
      const hasNumericBounds = min !== undefined || max !== undefined;
      const hasBooleanAliases =
        String((rawDefinition as any).trueValue ?? '').trim().length > 0 ||
        String((rawDefinition as any).falseValue ?? '').trim().length > 0;
      const rawOptions = Array.isArray((rawDefinition as any).options)
        ? (rawDefinition as any).options
            .map((item: unknown) => {
              if (typeof item === 'string') {
                const value = item.trim();
                return value ? { value, label: value } : null;
              }
              if (item && typeof item === 'object') {
                const value = String((item as { value?: unknown }).value ?? '').trim();
                const label = String((item as { label?: unknown }).label ?? value).trim();
                if (!value) return null;
                return { value, label: label || value };
              }
              return null;
            })
            .filter((item: DbConfigOption | null): item is DbConfigOption => item !== null)
        : [];
      const type: DbConfigFieldType =
        rawType === 'select' || (rawType !== 'boolean' && rawOptions.length > 0)
          ? 'select'
          : rawType === 'boolean' || hasBooleanAliases
            ? 'boolean'
            : rawType === 'number' || hasNumericBounds
              ? 'number'
              : 'text';

      const booleanOptions = buildBooleanFieldOptions(
        (rawDefinition as any).trueValue,
        (rawDefinition as any).falseValue
      );
      const title = String((rawDefinition as any).title ?? '').trim() || undefined;
      const options = type === 'boolean' ? booleanOptions.options : rawOptions;
      const description = String((rawDefinition as any).description ?? '').trim() || undefined;
      const section = String((rawDefinition as any).section ?? '').trim() || undefined;
      const format = normalizeDbKeyFormat((rawDefinition as any).format, type);

      keys[key] = {
        title,
        type,
        options,
        description,
        section,
        trueValue: type === 'boolean' ? booleanOptions.trueValue : undefined,
        falseValue: type === 'boolean' ? booleanOptions.falseValue : undefined,
        min,
        max,
        format,
      };
    });

    if (Object.keys(keys).length === 0) return;
    definitions.push({ path, format, keys });
  });

  return definitions;
};

export const uniquePaths = (paths: string[]): string[] => Array.from(new Set(paths));

const resolveKeyValueRuntimeOptions = (
  format: Extract<ConfigWriteFormat, 'manual' | 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'>,
  definition?: DbConfigFileFormatDefinition
): KeyValueFormatRuntimeOptions => {
  return {
    entrySeparator: definition?.entrySeparator ?? '\n',
    keyValueSeparator: definition?.keyValueSeparator,
    quoteKeys: Boolean(definition?.quoteKeys),
    quoteValues: Boolean(definition?.quoteValues),
    spacesAroundSeparator: Boolean(definition?.spacesAroundSeparator),
    commentPrefixes: definition?.commentPrefixes ?? [],
  };
};

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ensureTrailingNewline = (value: string): string => {
  if (!value) return '\n';
  return value.endsWith('\n') ? value : `${value}\n`;
};

export const quoteCfgValue = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export const BARE_SCALAR_PATTERN =
  /^(?:true|false|yes|no|on|off|null|nil|-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)$/i;

export const BOOLEAN_ALIAS_LOOKUP: Record<
  string,
  { state: BooleanState; family: BooleanAliasFamily }
> = {
  true: { state: 'true', family: 'literal' },
  false: { state: 'false', family: 'literal' },
  '1': { state: 'true', family: 'numeric' },
  '0': { state: 'false', family: 'numeric' },
  yes: { state: 'true', family: 'yesno' },
  no: { state: 'false', family: 'yesno' },
  on: { state: 'true', family: 'onoff' },
  off: { state: 'false', family: 'onoff' },
  enabled: { state: 'true', family: 'enabled' },
  disabled: { state: 'false', family: 'enabled' },
};

export const getBooleanAliasInfo = (
  rawValue: string
): { state: BooleanState; family: BooleanAliasFamily } | null =>
  BOOLEAN_ALIAS_LOOKUP[
    String(rawValue || '')
      .trim()
      .toLowerCase()
  ] ?? null;

export const formatBooleanAlias = (state: BooleanState, family: BooleanAliasFamily): string => {
  if (family === 'numeric') return state === 'true' ? '1' : '0';
  if (family === 'yesno') return state === 'true' ? 'yes' : 'no';
  if (family === 'onoff') return state === 'true' ? 'on' : 'off';
  if (family === 'enabled') return state === 'true' ? 'enabled' : 'disabled';
  return state;
};

export const isBooleanLikeSelect = (options: DbConfigOption[]): boolean => {
  if (!Array.isArray(options) || options.length < 2) return false;

  const infos = options.map((option) => getBooleanAliasInfo(option.value));
  if (infos.some((info) => info === null)) return false;

  const states = new Set(infos.map((info) => info!.state));
  return states.has('true') && states.has('false');
};

export const resolveSelectOptionValue = (options: DbConfigOption[], rawValue: string): string => {
  const exactMatch = options.find((option) => option.value === rawValue);
  if (exactMatch) return exactMatch.value;
  if (!isBooleanLikeSelect(options)) return rawValue;

  const aliasInfo = getBooleanAliasInfo(rawValue);
  if (!aliasInfo) return rawValue;

  const familyMatch = options.find((option) => {
    const optionInfo = getBooleanAliasInfo(option.value);
    return optionInfo?.state === aliasInfo.state && optionInfo.family === aliasInfo.family;
  });
  if (familyMatch) return familyMatch.value;

  const stateMatch = options.find(
    (option) => getBooleanAliasInfo(option.value)?.state === aliasInfo.state
  );
  return stateMatch?.value ?? rawValue;
};

export const coerceSelectInputValue = (
  options: DbConfigOption[],
  initialRawValue: string,
  nextOptionValue: string
): string => {
  if (!isBooleanLikeSelect(options)) return nextOptionValue;

  const initialInfo = getBooleanAliasInfo(initialRawValue);
  const nextInfo = getBooleanAliasInfo(nextOptionValue);
  if (initialInfo && nextInfo && initialInfo.state === nextInfo.state) {
    return initialRawValue;
  }

  return nextOptionValue;
};

export const serializeSelectValue = (
  field: VerifiedField,
  currentValue: string,
  initialRawValue: string
): string => {
  if (field.type === 'boolean') {
    const currentInfo =
      getBooleanAliasInfo(currentValue) ??
      getBooleanAliasInfo(resolveSelectOptionValue(field.options, currentValue));

    if (currentInfo?.state === 'true') {
      return field.trueValue ?? currentValue;
    }

    if (currentInfo?.state === 'false') {
      return field.falseValue ?? currentValue;
    }
  }

  if (!isBooleanLikeSelect(field.options)) return currentValue;

  const currentInfo = getBooleanAliasInfo(currentValue);
  const initialInfo = getBooleanAliasInfo(initialRawValue);
  if (currentInfo && initialInfo) {
    return formatBooleanAlias(currentInfo.state, initialInfo.family);
  }

  return currentValue;
};

export const resolveNumberFieldControlType = (
  fieldFormat?: DbConfigKeyFormatDefinition
): 'input' | 'slider' | null => {
  const rawType = String(fieldFormat?.type ?? '')
    .trim()
    .toLowerCase();
  if (rawType === 'input') return 'input';
  if (rawType === 'slider' || rawType === 'sidebar') return 'slider';
  return null;
};

export const resolveNumberFieldStep = (fieldFormat?: DbConfigKeyFormatDefinition): number | null => {
  const rawStep = Number(fieldFormat?.step);
  return Number.isFinite(rawStep) && rawStep > 0 ? rawStep : null;
};

export const mergeFieldFormatForWrite = (
  fileFormat?: DbConfigFileFormatDefinition,
  fieldFormat?: DbConfigKeyFormatDefinition
): DbConfigFileFormatDefinition | undefined => {
  if (!fileFormat && !fieldFormat) return undefined;

  const merged: DbConfigFileFormatDefinition = {
    ...(fileFormat ?? {}),
  };

  if (fieldFormat?.entrySeparator !== undefined) merged.entrySeparator = fieldFormat.entrySeparator;
  if (fieldFormat?.keyValueSeparator !== undefined) merged.keyValueSeparator = fieldFormat.keyValueSeparator;
  if (fieldFormat?.quoteKeys !== undefined) merged.quoteKeys = fieldFormat.quoteKeys;
  if (fieldFormat?.quoteValues !== undefined) merged.quoteValues = fieldFormat.quoteValues;
  if (fieldFormat?.spacesAroundSeparator !== undefined) {
    merged.spacesAroundSeparator = fieldFormat.spacesAroundSeparator;
  }
  if (fieldFormat?.commentPrefixes !== undefined) merged.commentPrefixes = fieldFormat.commentPrefixes;

  return merged;
};

export const isQuotedValue = (value: string): boolean =>
  /^(["'])(?:\\.|(?!\1).)*\1$/.test(String(value || '').trim());

export const stripInlineComment = (raw: string, markers: string[]): string => {
  const source = String(raw || '');
  const orderedMarkers = [...markers].sort((a, b) => b.length - a.length);
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let idx = 0; idx < source.length; idx += 1) {
    const char = source[idx];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && (inSingle || inDouble)) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;

    const previous = idx > 0 ? source[idx - 1] : ' ';
    if (idx > 0 && !/\s|,|\]|\}/.test(previous)) continue;

    const marker = orderedMarkers.find((candidate) => source.startsWith(candidate, idx));
    if (marker) return source.slice(0, idx).trimEnd();
  }

  return source;
};

export const normalizeRawValue = (
  raw: string,
  format: ConfigWriteFormat = 'unknown',
  commentMarkers?: string[]
): string => {
  let trimmed = String(raw || '').trim();

  if (format === 'lua') {
    trimmed = stripInlineComment(trimmed, ['--']).replace(/,\s*$/, '').trim();
  } else if (format === 'yaml' || format === 'toml') {
    trimmed = stripInlineComment(trimmed, ['#']).trim();
  } else if (
    format === 'ini' ||
    format === 'properties' ||
    format === 'cfg' ||
    format === 'txt' ||
    format === 'unknown' ||
    format === 'manual'
  ) {
    const markers = commentMarkers && commentMarkers.length > 0 ? commentMarkers : ['#', ';'];
    trimmed = stripInlineComment(trimmed, markers).trim();
  } else if (format === 'json') {
    trimmed = trimmed.replace(/,\s*$/, '').trim();
  }

  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  if (!quoted) return trimmed;
  return quoted[2];
};

export const stringifyScalarValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const coerceStructuredScalar = (value: string): string | number | boolean | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^null$/i.test(trimmed) || /^nil$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  return value;
};

export const sanitizeJsonLikeContent = (content: string): string => {
  const withoutBlockComments = String(content || '').replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments
    .split('\n')
    .map((line) => stripInlineComment(line, ['//']))
    .join('\n');

  return withoutLineComments.replace(/,\s*([}\]])/g, '$1');
};

export const collectObjectScalarValues = (
  source: unknown,
  target: Record<string, string>,
  prefix = ''
): void => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;

  Object.entries(source as Record<string, unknown>).forEach(([rawKey, rawValue]) => {
    const key = prefix ? `${prefix}.${rawKey}` : rawKey;
    if (rawValue === null || ['string', 'number', 'boolean'].includes(typeof rawValue)) {
      target[key.toLowerCase()] = stringifyScalarValue(rawValue);
      return;
    }

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      collectObjectScalarValues(rawValue, target, key);
    }
  });
};

export const parseStructuredJsonContent = (content: string): Record<string, string> => {
  const normalized = String(content || '').trim();
  if (!normalized) return {};

  const candidates = [normalized, sanitizeJsonLikeContent(normalized)];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const values: Record<string, string> = {};
      collectObjectScalarValues(parsed, values);
      if (Object.keys(values).length > 0) return values;
    } catch {
      continue;
    }
  }

  return {};
};

const normalizeKeyToken = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();

const normalizeSectionToken = (value?: string): string =>
  String(value || '')
    .trim()
    .toLowerCase();

const getKeyValueReadMode = (
  format: Extract<ConfigWriteFormat, 'manual' | 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'>
): Extract<ConfigWriteFormat, 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'> =>
  format === 'manual' ? 'unknown' : format;

const getCommentPrefixesForKeyValue = (
  format: Extract<ConfigWriteFormat, 'manual' | 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'>,
  options?: KeyValueFormatRuntimeOptions
): string[] =>
  options?.commentPrefixes?.filter(Boolean) ??
  (format === 'cfg' || format === 'txt' || format === 'unknown' || format === 'manual'
    ? ['#', ';', '//', '--']
    : ['#', ';']);

interface ParsedKeyValueAssignment {
  key: string;
  rawValue: string;
}

const parseKeyValueAssignment = (
  line: string,
  format: Extract<ConfigWriteFormat, 'manual' | 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'>,
  options?: KeyValueFormatRuntimeOptions
): ParsedKeyValueAssignment | null => {
  const explicitSeparator = options?.keyValueSeparator;
  if (explicitSeparator) {
    const separatorIndex = line.indexOf(explicitSeparator);
    if (separatorIndex >= 0) {
      const key = line.slice(0, separatorIndex).trim();
      if (!key) return null;
      return {
        key,
        rawValue: line.slice(separatorIndex + explicitSeparator.length),
      };
    }
  }

  const equalsMatch = /^\s*([^=:]+?)\s*[:=]\s*(.*)\s*$/.exec(line);
  if (equalsMatch) {
    const key = equalsMatch[1].trim();
    if (!key) return null;
    return { key, rawValue: equalsMatch[2] };
  }

  const whitespaceMatch = /^\s*([A-Za-z0-9._-]+)\s+(.+?)\s*$/.exec(line);
  if (whitespaceMatch && (format === 'cfg' || format === 'txt' || format === 'unknown' || format === 'manual')) {
    return {
      key: whitespaceMatch[1].trim(),
      rawValue: whitespaceMatch[2],
    };
  }

  return null;
};

export const pickDefinedFieldValues = (
  sourceValues: Record<string, string>,
  fields: Record<string, DbConfigFieldDefinition>
): Record<string, string> => {
  const pickedValues: Record<string, string> = {};
  Object.keys(fields).forEach((key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey in sourceValues) {
      pickedValues[normalizedKey] = sourceValues[normalizedKey];
    }
  });
  return pickedValues;
};

export const readKeyValueFieldValues = (
  content: string,
  format: Extract<ConfigWriteFormat, 'manual' | 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'>,
  definition: Pick<DbConfigFileDefinition, 'format' | 'keys'>
): Record<string, string> => {
  const values: Record<string, string> = {};
  const normalizedContent = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  Object.entries(definition.keys).forEach(([key, field]) => {
    const mergedFormat = mergeFieldFormatForWrite(definition.format, field.format);
    const runtimeOptions = resolveKeyValueRuntimeOptions(format, mergedFormat);
    const entrySeparator = (runtimeOptions.entrySeparator || '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const entries = normalizedContent.split(entrySeparator || '\n');
    const commentPrefixes = getCommentPrefixesForKeyValue(format, runtimeOptions);
    const readMode = getKeyValueReadMode(format);
    const targetKey = normalizeKeyToken(key);
    const targetSection = format === 'ini' ? normalizeSectionToken(field.section) : '';

    let currentSection = '';
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed) continue;

      if (format === 'ini') {
        const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);
        if (sectionMatch) {
          currentSection = normalizeSectionToken(sectionMatch[1]);
          continue;
        }
      }

      if (commentPrefixes.some((prefix) => prefix && trimmed.startsWith(prefix))) continue;

      const assignment = parseKeyValueAssignment(entry, format, runtimeOptions);
      if (!assignment) continue;
      if (normalizeKeyToken(assignment.key) !== targetKey) continue;
      if (format === 'ini' && targetSection && currentSection !== targetSection) continue;

      values[key.toLowerCase()] = normalizeRawValue(assignment.rawValue, readMode, commentPrefixes);
      break;
    }
  });

  return values;
};

const decodeXmlAttribute = (value: string): string =>
  String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const escapeXmlAttribute = (value: string): string =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const parseSdtdXml1Content = (content: string): Record<string, string> => {
  const values: Record<string, string> = {};
  const propertyPattern = /<property\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*\bvalue\s*=\s*"([^"]*)"[^>]*\/?>/gi;

  for (const match of String(content || '').matchAll(propertyPattern)) {
    const key = String(match[1] || '').trim();
    if (!key) continue;
    values[key.toLowerCase()] = decodeXmlAttribute(match[2] || '');
  }

  return values;
};

const splitTopLevelDelimited = (source: string, delimiter: string): string[] => {
  const items: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (char === '(') parenDepth += 1;
      if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
      if (char === '{') braceDepth += 1;
      if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
      if (char === '[') bracketDepth += 1;
      if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

      if (
        char === delimiter &&
        parenDepth === 0 &&
        braceDepth === 0 &&
        bracketDepth === 0
      ) {
        items.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());
  return items;
};

const findTopLevelCharacterIndex = (source: string, target: string): number => {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let idx = 0; idx < source.length; idx += 1) {
    const char = source[idx];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;

    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (char === '{') braceDepth += 1;
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === target && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      return idx;
    }
  }

  return -1;
};

export const parsePwIni1Content = (content: string): Record<string, string> => {
  const values: Record<string, string> = {};
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || /^\[[^\]]+\]$/.test(trimmed)) {
      return;
    }

    const rootMatch = /^([A-Za-z0-9_.-]+)\s*=\s*\((.*)\)\s*$/.exec(trimmed);
    if (!rootMatch) return;

    const rootKey = rootMatch[1].trim();
    splitTopLevelDelimited(rootMatch[2], ',').forEach((entry) => {
      const separatorIndex = findTopLevelCharacterIndex(entry, '=');
      if (separatorIndex <= 0) return;

      const nestedKey = entry.slice(0, separatorIndex).trim();
      const rawValue = entry.slice(separatorIndex + 1).trim();
      if (!nestedKey) return;
      values[`${rootKey}.${nestedKey}`.toLowerCase()] = normalizeRawValue(rawValue, 'unknown');
    });
  });

  return values;
};

export const parsePzLua1Content = (content: string): Record<string, string> => {
  const values: Record<string, string> = {};
  const stack: string[] = [];
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  lines.forEach((line) => {
    const withoutComments = stripInlineComment(line, ['--']).trim();
    if (!withoutComments) return;

    const openTableMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*,?\s*$/.exec(withoutComments);
    if (openTableMatch) {
      stack.push(openTableMatch[1].trim());
      return;
    }

    if (/^\}\s*,?\s*$/.test(withoutComments)) {
      if (stack.length > 0) stack.pop();
      return;
    }

    const valueMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*,?\s*$/.exec(withoutComments);
    if (!valueMatch) return;

    const key = valueMatch[1].trim();
    if (!key) return;

    const pathSegments = [...stack];
    if (pathSegments[0] === 'SandboxVars') pathSegments.shift();
    pathSegments.push(key);
    values[pathSegments.join('.').toLowerCase()] = normalizeRawValue(valueMatch[2], 'lua');
  });

  return values;
};

export const setJsonValueByPath = (
  target: Record<string, unknown>,
  keyPath: string,
  value: unknown
): void => {
  const segments = keyPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return;

  let cursor: Record<string, unknown> = target;
  for (let idx = 0; idx < segments.length - 1; idx += 1) {
    const segment = segments[idx];
    const next = cursor[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value;
};

export const upsertJsonContent = (content: string, key: string, value: string): string => {
  const normalized = String(content || '').trim();
  if (!normalized) {
    const next = {};
    setJsonValueByPath(next, key, coerceStructuredScalar(value));
    return ensureTrailingNewline(JSON.stringify(next, null, 2));
  }

  const candidates = [normalized, sanitizeJsonLikeContent(normalized)];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON config must be an object.');
      }
      setJsonValueByPath(parsed as Record<string, unknown>, key, coerceStructuredScalar(value));
      return ensureTrailingNewline(JSON.stringify(parsed, null, 2));
    } catch {
      continue;
    }
  }

  throw new Error('Unsupported JSON config content for inline save.');
};

const ensureTrailingSeparator = (value: string, separator: string): string => {
  if (!separator) return value;
  if (!value) return separator;
  return value.endsWith(separator) ? value : `${value}${separator}`;
};

const formatNumericLikeExistingRaw = (value: string, existingRaw: string): string => {
  const trimmedValue = String(value || '').trim();
  if (!/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmedValue)) return trimmedValue;

  const existingScalar = normalizeRawValue(existingRaw, 'unknown');
  if (/^-?\d+\.\d+$/.test(existingScalar)) {
    const precision = existingScalar.split('.')[1].length;
    const numericValue = Number(trimmedValue);
    if (Number.isFinite(numericValue)) return numericValue.toFixed(precision);
  }

  return trimmedValue;
};

const formatStructuredScalarValue = (
  value: string,
  existingRaw = '',
  forceQuote = false
): string => {
  const numericCandidate = formatNumericLikeExistingRaw(value, existingRaw);
  const trimmed = String(numericCandidate || '').trim();

  if (forceQuote || isQuotedValue(existingRaw)) return quoteCfgValue(value);
  if (!trimmed) return '';
  if (BARE_SCALAR_PATTERN.test(trimmed) || /^[A-Za-z0-9_.-]+$/.test(trimmed)) return trimmed;
  return quoteCfgValue(value);
};

export const upsertKeyValueContent = (
  content: string,
  key: string,
  value: string,
  format: ConfigWriteFormat,
  definition?: DbConfigFileFormatDefinition,
  section?: string
): string => {
  const keyValueFormat: Extract<
    ConfigWriteFormat,
    'manual' | 'ini' | 'properties' | 'cfg' | 'txt' | 'toml' | 'unknown'
  > =
    format === 'manual' ||
    format === 'ini' ||
    format === 'properties' ||
    format === 'cfg' ||
    format === 'txt' ||
    format === 'toml'
      ? format
      : 'unknown';

  const runtimeOptions = resolveKeyValueRuntimeOptions(keyValueFormat, definition);
  const entrySeparator = (runtimeOptions.entrySeparator || '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const separator = runtimeOptions.keyValueSeparator;
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.length > 0 ? normalized.split(entrySeparator || '\n') : [];
  const nextKey = runtimeOptions.quoteKeys ? quoteCfgValue(key) : key;
  const targetKey = normalizeKeyToken(key);
  const targetSection = keyValueFormat === 'ini' ? normalizeSectionToken(section) : '';
  const commentPrefixes = getCommentPrefixesForKeyValue(keyValueFormat, runtimeOptions);
  const orderedCommentPrefixes = [...commentPrefixes].filter(Boolean).sort((a, b) => b.length - a.length);
  const formatValueForWrite = (): string => {
    if (runtimeOptions.quoteValues) return quoteCfgValue(value);
    return value;
  };
  const buildSeparatorToken = (lineSeparator: string): string =>
    separator
      ? runtimeOptions.spacesAroundSeparator
        ? ` ${lineSeparator} `
        : lineSeparator
      : lineSeparator;
  const buildAssignmentLine = (leadingWhitespace = ''): string => {
    if (separator) {
      return `${leadingWhitespace}${nextKey}${buildSeparatorToken(separator)}${formatValueForWrite()}`;
    }
    if (
      keyValueFormat === 'cfg' ||
      keyValueFormat === 'txt' ||
      keyValueFormat === 'unknown' ||
      keyValueFormat === 'manual'
    ) {
      const needsQuote =
        /\s/.test(value) && !/^(true|false|yes|no|[01]|-?\d+(\.\d+)?)$/i.test(value);
      return `${leadingWhitespace}${nextKey} ${
        runtimeOptions.quoteValues ? quoteCfgValue(value) : needsQuote ? quoteCfgValue(value) : value
      }`;
    }
    return `${leadingWhitespace}${nextKey}=${formatValueForWrite()}`;
  };

  const tryUpdateExistingLine = (): boolean => {
    let currentSection = '';
    const matches: Array<{
      index: number;
      commented: boolean;
      leadingWhitespace: string;
    }> = [];

    for (let idx = 0; idx < lines.length; idx += 1) {
      const currentLine = lines[idx];
      const trimmed = currentLine.trim();
      if (!trimmed) continue;

      if (keyValueFormat === 'ini') {
        const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);
        if (sectionMatch) {
          currentSection = normalizeSectionToken(sectionMatch[1]);
          continue;
        }
      }

      const matchingCommentPrefix = orderedCommentPrefixes.find(
        (prefix) => prefix && trimmed.startsWith(prefix)
      );

      if (matchingCommentPrefix) {
        const leadingWhitespace = /^\s*/.exec(currentLine)?.[0] ?? '';
        const trimmedLeading = currentLine.slice(leadingWhitespace.length);
        const uncommentedLine = `${leadingWhitespace}${trimmedLeading
          .slice(matchingCommentPrefix.length)
          .replace(/^\s+/, '')}`;
        const assignment = parseKeyValueAssignment(uncommentedLine, keyValueFormat, runtimeOptions);
        if (!assignment) continue;
        if (normalizeKeyToken(assignment.key) !== targetKey) continue;
        if (keyValueFormat === 'ini' && targetSection && currentSection !== targetSection) continue;

        matches.push({
          index: idx,
          commented: true,
          leadingWhitespace,
        });
        continue;
      }

      const assignment = parseKeyValueAssignment(currentLine, keyValueFormat, runtimeOptions);
      if (!assignment) continue;
      if (normalizeKeyToken(assignment.key) !== targetKey) continue;
      if (keyValueFormat === 'ini' && targetSection && currentSection !== targetSection) continue;

      matches.push({
        index: idx,
        commented: false,
        leadingWhitespace: /^\s*/.exec(currentLine)?.[0] ?? '',
      });
    }

    if (matches.length === 0) return false;

    const firstMatch = matches[0];
    const firstActiveMatch = matches.find((match) => !match.commented) ?? null;
    const primaryMatch =
      firstMatch.commented || !firstActiveMatch ? firstMatch : firstActiveMatch;

    lines[primaryMatch.index] = buildAssignmentLine(primaryMatch.leadingWhitespace);

    for (let idx = matches.length - 1; idx >= 0; idx -= 1) {
      const match = matches[idx];
      if (match.index === primaryMatch.index) continue;
      lines.splice(match.index, 1);
    }

    return true;
  };

  const updated = tryUpdateExistingLine();

  if (!updated) {
    if (keyValueFormat === 'ini' && targetSection) {
      let sectionStartIndex = -1;
      let sectionEndIndex = lines.length;
      for (let idx = 0; idx < lines.length; idx += 1) {
        const trimmed = lines[idx].trim();
        const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed);
        if (!sectionMatch) continue;

        const normalizedSection = normalizeSectionToken(sectionMatch[1]);
        if (sectionStartIndex >= 0) {
          sectionEndIndex = idx;
          break;
        }
        if (normalizedSection === targetSection) {
          sectionStartIndex = idx;
        }
      }

      if (sectionStartIndex >= 0) {
        lines.splice(sectionEndIndex, 0, buildAssignmentLine());
      } else {
        if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(`[${section}]`);
        lines.push(buildAssignmentLine());
      }
    } else {
      lines.push(buildAssignmentLine());
    }
  }

  return ensureTrailingSeparator(lines.join(entrySeparator), entrySeparator || '\n');
};

export const upsertSdtdXml1Content = (content: string, key: string, value: string): string => {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const escapedKey = escapeRegExp(key);
  const valueRegex = new RegExp(
    `(<property\\b[^>]*\\bname\\s*=\\s*"${escapedKey}"[^>]*\\bvalue\\s*=\\s*")([^"]*)(".*)`,
    'i'
  );

  let updated = false;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const match = valueRegex.exec(lines[idx]);
    if (!match) continue;
    lines[idx] = `${match[1]}${escapeXmlAttribute(value)}${match[3]}`;
    updated = true;
    break;
  }

  if (!updated) {
    const insertionLine = `\t<property name="${key}" value="${escapeXmlAttribute(value)}"/>`;
    const closingTagIndex = lines.findIndex((line) => /<\/ServerSettings>/i.test(line));
    if (closingTagIndex >= 0) {
      lines.splice(closingTagIndex, 0, insertionLine);
    } else {
      lines.push(insertionLine);
    }
  }

  return ensureTrailingNewline(lines.join('\n'));
};

export const upsertPwIni1Content = (
  content: string,
  key: string,
  value: string,
  definition?: DbConfigFileFormatDefinition
): string => {
  const segments = key
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return upsertKeyValueContent(content, key, value, 'ini', definition);
  }

  const rootKey = segments[0];
  const nestedKey = segments.slice(1).join('.');
  const forceQuote = Boolean(definition?.quoteValues);
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const rootRegex = new RegExp(`^(\\s*${escapeRegExp(rootKey)}\\s*=\\s*)\\((.*)\\)(\\s*)$`, 'i');

  let updated = false;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const match = rootRegex.exec(lines[idx]);
    if (!match) continue;

    const assignments = splitTopLevelDelimited(match[2], ',')
      .map((entry) => {
        const separatorIndex = findTopLevelCharacterIndex(entry, '=');
        if (separatorIndex <= 0) return null;
        return {
          key: entry.slice(0, separatorIndex).trim(),
          value: entry.slice(separatorIndex + 1).trim(),
        };
      })
      .filter(
        (entry): entry is { key: string; value: string } => entry !== null && entry.key.length > 0
      );

    const targetIndex = assignments.findIndex(
      (entry) => normalizeKeyToken(entry.key) === normalizeKeyToken(nestedKey)
    );
    const existingRaw = targetIndex >= 0 ? assignments[targetIndex].value : '';
    const nextRawValue = formatStructuredScalarValue(value, existingRaw, forceQuote);

    if (targetIndex >= 0) {
      assignments[targetIndex].value = nextRawValue;
    } else {
      assignments.push({ key: nestedKey, value: nextRawValue });
    }

    lines[idx] = `${match[1]}(${assignments.map((entry) => `${entry.key}=${entry.value}`).join(',')})${match[3]}`;
    updated = true;
    break;
  }

  if (!updated) {
    lines.push(`${rootKey}=(${nestedKey}=${formatStructuredScalarValue(value, '', forceQuote)})`);
  }

  return ensureTrailingNewline(lines.join('\n'));
};

const findPzLuaSectionRange = (
  lines: string[],
  targetPath: string[]
): { start: number; end: number } | null => {
  const stack: string[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const trimmed = stripInlineComment(lines[idx], ['--']).trim();
    if (!trimmed) continue;

    const openMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*,?\s*$/.exec(trimmed);
    if (openMatch) {
      stack.push(openMatch[1].trim());

      if (stack.join('.') === targetPath.join('.')) {
        const nestedStack = [...stack];
        for (let innerIndex = idx + 1; innerIndex < lines.length; innerIndex += 1) {
          const innerTrimmed = stripInlineComment(lines[innerIndex], ['--']).trim();
          if (!innerTrimmed) continue;

          const nestedOpenMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*,?\s*$/.exec(innerTrimmed);
          if (nestedOpenMatch) {
            nestedStack.push(nestedOpenMatch[1].trim());
            continue;
          }

          if (/^\}\s*,?\s*$/.test(innerTrimmed)) {
            if (nestedStack.length === targetPath.length) {
              return { start: idx, end: innerIndex };
            }
            nestedStack.pop();
          }
        }

        return null;
      }

      continue;
    }

    if (/^\}\s*,?\s*$/.test(trimmed) && stack.length > 0) {
      stack.pop();
    }
  }

  return null;
};

const buildPzLuaNestedBlock = (
  sectionSegments: string[],
  key: string,
  rawValue: string,
  indent: string
): string[] => {
  if (sectionSegments.length === 0) {
    return [`${indent}${key} = ${rawValue},`];
  }

  const [currentSection, ...remainingSections] = sectionSegments;
  return [
    `${indent}${currentSection} = {`,
    ...buildPzLuaNestedBlock(remainingSections, key, rawValue, `${indent}    `),
    `${indent}},`,
  ];
};

export const upsertPzLua1Content = (
  content: string,
  key: string,
  value: string,
  definition?: DbConfigFileFormatDefinition
): string => {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const initialLines = normalized.length > 0 ? normalized.split('\n') : [];
  const lines =
    initialLines.length > 0
      ? initialLines
      : ['SandboxVars = {', '}', ''];
  const segments = key
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return ensureTrailingNewline(lines.join('\n'));

  const fieldKey = segments[segments.length - 1];
  const sectionSegments = segments.slice(0, -1);
  const targetPath = ['SandboxVars', ...sectionSegments];
  const forceQuote = Boolean(definition?.quoteValues);
  const targetRange = findPzLuaSectionRange(lines, targetPath);

  const updateWithinRange = (range: { start: number; end: number }): boolean => {
    let nestedDepth = 0;
    const assignmentRegex = new RegExp(
      `^(\\s*)${escapeRegExp(fieldKey)}\\s*=\\s*(.+?)(\\s*,?\\s*(?:--.*)?)$`
    );

    for (let idx = range.start + 1; idx < range.end; idx += 1) {
      const trimmed = stripInlineComment(lines[idx], ['--']).trim();
      if (!trimmed) continue;

      if (/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{\s*,?\s*$/.test(trimmed)) {
        nestedDepth += 1;
        continue;
      }
      if (/^\}\s*,?\s*$/.test(trimmed)) {
        nestedDepth = Math.max(0, nestedDepth - 1);
        continue;
      }
      if (nestedDepth !== 0) continue;

      const match = assignmentRegex.exec(lines[idx]);
      if (!match) continue;

      lines[idx] = `${match[1]}${fieldKey} = ${formatStructuredScalarValue(
        value,
        match[2],
        forceQuote
      )}${match[3]}`;
      return true;
    }

    const closingIndent = /^\s*/.exec(lines[range.end])?.[0] ?? '';
    lines.splice(
      range.end,
      0,
      `${closingIndent}    ${fieldKey} = ${formatStructuredScalarValue(value, '', forceQuote)},`
    );
    return true;
  };

  if (targetRange && updateWithinRange(targetRange)) {
    return ensureTrailingNewline(lines.join('\n'));
  }

  const rootRange = findPzLuaSectionRange(lines, ['SandboxVars']);
  if (!rootRange) {
    const rawValue = formatStructuredScalarValue(value, '', forceQuote);
    return ensureTrailingNewline(
      ['SandboxVars = {', ...buildPzLuaNestedBlock(sectionSegments, fieldKey, rawValue, '    '), '}'].join('\n')
    );
  }

  const rawValue = formatStructuredScalarValue(value, '', forceQuote);
  const insertionIndent = `${/^\s*/.exec(lines[rootRange.end])?.[0] ?? ''}    `;
  lines.splice(
    rootRange.end,
    0,
    ...buildPzLuaNestedBlock(sectionSegments, fieldKey, rawValue, insertionIndent)
  );
  return ensureTrailingNewline(lines.join('\n'));
};

export const buildFilePathCandidates = (filePath: string): string[] => {
  const normalized = normalizeConfigPath(filePath);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  if (!normalized.toLowerCase().startsWith('/serverfiles/')) {
    const withoutLeadingSlash = normalized.replace(/^\/+/, '');
    candidates.add(`/serverfiles/${withoutLeadingSlash}`);
  }

  return Array.from(candidates);
};

export const toFieldId = (filePath: string, key: string) => `${filePath}::${key}`;

export const areMapsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};
