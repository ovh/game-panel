import {
  type DbConfigFileDefinition,
  type DbConfigFileFormatDefinition,
  type VerifiedField,
  ensureTrailingNewline,
  getBooleanAliasInfo,
  isQuotedValue,
  mergeFieldFormatForWrite,
  normalizeRawValue,
  parsePzLua1Content,
  parsePwIni1Content,
  parseSdtdXml1Content,
  parseStructuredJsonContent,
  pickDefinedFieldValues,
  quoteCfgValue,
  readKeyValueFieldValues,
  stripInlineComment,
  upsertJsonContent,
  upsertKeyValueContent,
  upsertPzLua1Content,
  upsertPwIni1Content,
  upsertSdtdXml1Content,
} from './configUtils';

type DefinitionLike = Pick<DbConfigFileDefinition, 'format' | 'keys'>;
type WritableField = Pick<VerifiedField, 'key' | 'section' | 'format'>;

export type InlineConfigProfileId =
  | 'cfg_linuxgsm_1'
  | 'json_armar_1'
  | 'cfg_cs2_1'
  | 'cfg_dayz_1'
  | 'cfg_gmod_1'
  | 'ini_ark_1'
  | 'ini_hz_1'
  | 'properties_mc_1'
  | 'ini_pw_1'
  | 'ini_pz_1'
  | 'lua_pz_1'
  | 'cfg_rust_1'
  | 'xml_sdtd_1'
  | 'ini_sf_1'
  | 'cfg_tf2_1';

interface InlineConfigProfileHandler {
  read: (content: string, filePath: string, definition: DefinitionLike) => Record<string, string>;
  write: (
    content: string,
    key: string,
    value: string,
    filePath: string,
    definition: DefinitionLike,
    field?: WritableField
  ) => string;
}

const SUPPORTED_INLINE_CONFIG_PROFILE_IDS = new Set<InlineConfigProfileId>([
  'cfg_linuxgsm_1',
  'json_armar_1',
  'cfg_cs2_1',
  'cfg_dayz_1',
  'cfg_gmod_1',
  'ini_ark_1',
  'ini_hz_1',
  'properties_mc_1',
  'ini_pw_1',
  'ini_pz_1',
  'lua_pz_1',
  'cfg_rust_1',
  'xml_sdtd_1',
  'ini_sf_1',
  'cfg_tf2_1',
]);

const COMMAND_KEY_PATTERN = /^([A-Za-z0-9._-]+)(?:\s+(.*?))?$/;
const DAYZ_KEY_PATTERN = /^([A-Za-z0-9_.\[\]-]+)\s*=\s*(.*?)\s*;\s*$/;
const NUMBER_LIKE_PATTERN = /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/;

const normalizeProfileType = (rawType: unknown): string =>
  String(rawType ?? '')
    .trim()
    .toLowerCase();

export const resolveInlineConfigProfileId = (
  format?: Pick<DbConfigFileFormatDefinition, 'type'> | null
): InlineConfigProfileId | null => {
  const normalizedType = normalizeProfileType(format?.type);
  if (!normalizedType) return null;

  return SUPPORTED_INLINE_CONFIG_PROFILE_IDS.has(normalizedType as InlineConfigProfileId)
    ? (normalizedType as InlineConfigProfileId)
    : null;
};

export const isInlineConfigProfileSupported = (
  format?: Pick<DbConfigFileFormatDefinition, 'type'> | null
): boolean => resolveInlineConfigProfileId(format) !== null;

const cloneDefinitionWithFormat = (
  definition: DefinitionLike,
  formatOverride: Partial<DbConfigFileFormatDefinition>
): DefinitionLike => ({
  ...definition,
  format: {
    ...(definition.format ?? {}),
    ...formatOverride,
  },
});

const readKeyValueProfile =
  (
    format: 'ini' | 'properties' | 'cfg',
    formatOverride?: Partial<DbConfigFileFormatDefinition>
  ): InlineConfigProfileHandler['read'] =>
  (content, _filePath, definition) =>
    readKeyValueFieldValues(
      content,
      format,
      cloneDefinitionWithFormat(definition, {
        ...(formatOverride ?? {}),
        type: format,
      })
    );

const writeKeyValueProfile =
  (
    format: 'ini' | 'properties' | 'cfg',
    formatOverride?: Partial<DbConfigFileFormatDefinition>
  ): InlineConfigProfileHandler['write'] =>
  (content, key, value, _filePath, definition, field) => {
    const overriddenFormat = {
      ...(definition.format ?? {}),
      ...(formatOverride ?? {}),
      type: format,
    };

    return upsertKeyValueContent(
      content,
      key,
      value,
      format,
      mergeFieldFormatForWrite(overriddenFormat, field?.format),
      field?.section
    );
  };

const pickDefinedValues = (
  sourceValues: Record<string, string>,
  definition: DefinitionLike
): Record<string, string> => {
  const nextValues: Record<string, string> = {};

  Object.keys(definition.keys).forEach((key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey in sourceValues) {
      nextValues[normalizedKey] = sourceValues[normalizedKey];
    }
  });

  return nextValues;
};

const formatWhitespaceCommandValue = (value: string, existingRaw = ''): string => {
  const trimmed = String(value || '').trim();
  if (isQuotedValue(existingRaw)) return quoteCfgValue(value);
  if (!trimmed) return '""';
  if (NUMBER_LIKE_PATTERN.test(trimmed)) return trimmed;
  if (getBooleanAliasInfo(trimmed)) return trimmed;
  return quoteCfgValue(value);
};

const readWhitespaceCommandContent = (
  content: string,
  definition: DefinitionLike,
  commentPrefixes: string[]
): Record<string, string> => {
  const values: Record<string, string> = {};
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (commentPrefixes.some((prefix) => prefix && trimmed.startsWith(prefix))) return;

    const candidate = stripInlineComment(line, commentPrefixes).trim();
    if (!candidate) return;

    const match = COMMAND_KEY_PATTERN.exec(candidate);
    if (!match) return;

    const key = String(match[1] || '').trim();
    if (!key) return;

    values[key.toLowerCase()] = normalizeRawValue(match[2] ?? '', 'cfg', commentPrefixes);
  });

  return pickDefinedValues(values, definition);
};

const upsertWhitespaceCommandContent = (
  content: string,
  key: string,
  value: string,
  commentPrefixes: string[]
): string => {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const targetKey = String(key || '').trim().toLowerCase();

  let primaryIndex = -1;
  let primaryLeadingWhitespace = '';
  let primaryExistingRaw = '';
  const duplicateIndexes: number[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const leadingWhitespace = /^\s*/.exec(line)?.[0] ?? '';
    const commentedPrefix = commentPrefixes.find((prefix) => prefix && trimmed.startsWith(prefix));
    const candidateSource = commentedPrefix
      ? trimmed.slice(commentedPrefix.length).replace(/^\s+/, '')
      : stripInlineComment(line, commentPrefixes).trim();

    const match = COMMAND_KEY_PATTERN.exec(candidateSource);
    if (!match) continue;

    const candidateKey = String(match[1] || '').trim().toLowerCase();
    if (candidateKey !== targetKey) continue;

    if (primaryIndex === -1 || !commentedPrefix) {
      if (primaryIndex !== -1 && primaryIndex !== idx) {
        duplicateIndexes.push(primaryIndex);
      }
      primaryIndex = idx;
      primaryLeadingWhitespace = leadingWhitespace;
      primaryExistingRaw = match[2] ?? '';
      if (!commentedPrefix) continue;
    } else {
      duplicateIndexes.push(idx);
    }
  }

  const nextLine = `${primaryLeadingWhitespace}${key} ${formatWhitespaceCommandValue(
    value,
    primaryExistingRaw
  )}`;

  if (primaryIndex >= 0) {
    lines[primaryIndex] = nextLine;
  } else {
    lines.push(`${key} ${formatWhitespaceCommandValue(value)}`);
  }

  duplicateIndexes
    .filter((index) => index !== primaryIndex)
    .sort((a, b) => b - a)
    .forEach((index) => {
      lines.splice(index, 1);
    });

  return ensureTrailingNewline(lines.join('\n'));
};

const formatDayzValue = (value: string, existingRaw = ''): string => {
  const trimmed = String(value || '').trim();
  if (isQuotedValue(existingRaw)) return quoteCfgValue(value);
  if (!trimmed) return '""';
  if (NUMBER_LIKE_PATTERN.test(trimmed)) return trimmed;
  if (getBooleanAliasInfo(trimmed)) return trimmed;
  return quoteCfgValue(value);
};

const readDayzContent = (content: string, definition: DefinitionLike): Record<string, string> => {
  const values: Record<string, string> = {};
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    const candidate = stripInlineComment(line, ['//']).trim();
    if (!candidate) return;

    const match = DAYZ_KEY_PATTERN.exec(candidate);
    if (!match) return;

    const key = String(match[1] || '').trim();
    if (!key) return;

    values[key.toLowerCase()] = normalizeRawValue(match[2] ?? '', 'unknown', ['//']);
  });

  return pickDefinedValues(values, definition);
};

const upsertDayzContent = (content: string, key: string, value: string): string => {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const targetKey = String(key || '').trim().toLowerCase();

  let primaryIndex = -1;
  let primaryLeadingWhitespace = '';
  let primaryExistingRaw = '';
  const duplicateIndexes: number[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const leadingWhitespace = /^\s*/.exec(line)?.[0] ?? '';
    const candidateSource = trimmed.startsWith('//')
      ? trimmed.slice(2).replace(/^\s+/, '')
      : stripInlineComment(line, ['//']).trim();

    const match = DAYZ_KEY_PATTERN.exec(candidateSource);
    if (!match) continue;

    const candidateKey = String(match[1] || '').trim().toLowerCase();
    if (candidateKey !== targetKey) continue;

    const isCommented = trimmed.startsWith('//');
    if (primaryIndex === -1 || !isCommented) {
      if (primaryIndex !== -1 && primaryIndex !== idx) {
        duplicateIndexes.push(primaryIndex);
      }
      primaryIndex = idx;
      primaryLeadingWhitespace = leadingWhitespace;
      primaryExistingRaw = match[2] ?? '';
      if (!isCommented) continue;
    } else {
      duplicateIndexes.push(idx);
    }
  }

  const nextLine = `${primaryLeadingWhitespace}${key} = ${formatDayzValue(
    value,
    primaryExistingRaw
  )};`;

  if (primaryIndex >= 0) {
    lines[primaryIndex] = nextLine;
  } else {
    lines.push(`${key} = ${formatDayzValue(value)};`);
  }

  duplicateIndexes
    .filter((index) => index !== primaryIndex)
    .sort((a, b) => b - a)
    .forEach((index) => {
      lines.splice(index, 1);
    });

  return ensureTrailingNewline(lines.join('\n'));
};

const PROFILE_HANDLERS: Record<InlineConfigProfileId, InlineConfigProfileHandler> = {
  cfg_linuxgsm_1: {
    read: readKeyValueProfile('cfg', {
      keyValueSeparator: '=',
      quoteValues: true,
      commentPrefixes: ['#'],
    }),
    write: writeKeyValueProfile('cfg', {
      keyValueSeparator: '=',
      quoteValues: true,
      commentPrefixes: ['#'],
    }),
  },
  json_armar_1: {
    read: (content, _filePath, definition) =>
      pickDefinedFieldValues(parseStructuredJsonContent(content), definition.keys),
    write: (content, key, value) => upsertJsonContent(content, key, value),
  },
  cfg_cs2_1: {
    read: (content, _filePath, definition) =>
      readWhitespaceCommandContent(content, definition, ['//']),
    write: (content, key, value) => upsertWhitespaceCommandContent(content, key, value, ['//']),
  },
  cfg_dayz_1: {
    read: (content, _filePath, definition) => readDayzContent(content, definition),
    write: (content, key, value) => upsertDayzContent(content, key, value),
  },
  cfg_gmod_1: {
    read: (content, _filePath, definition) =>
      readWhitespaceCommandContent(content, definition, ['//']),
    write: (content, key, value) => upsertWhitespaceCommandContent(content, key, value, ['//']),
  },
  ini_ark_1: {
    read: readKeyValueProfile('ini'),
    write: writeKeyValueProfile('ini'),
  },
  ini_hz_1: {
    read: readKeyValueProfile('ini'),
    write: writeKeyValueProfile('ini'),
  },
  properties_mc_1: {
    read: readKeyValueProfile('properties'),
    write: writeKeyValueProfile('properties'),
  },
  ini_pw_1: {
    read: (content, _filePath, definition) =>
      pickDefinedFieldValues(parsePwIni1Content(content), definition.keys),
    write: (content, key, value, _filePath, definition, field) =>
      upsertPwIni1Content(
        content,
        key,
        value,
        mergeFieldFormatForWrite(definition.format, field?.format)
      ),
  },
  ini_pz_1: {
    read: readKeyValueProfile('ini'),
    write: writeKeyValueProfile('ini'),
  },
  lua_pz_1: {
    read: (content, _filePath, definition) =>
      pickDefinedFieldValues(parsePzLua1Content(content), definition.keys),
    write: (content, key, value, _filePath, definition, field) =>
      upsertPzLua1Content(
        content,
        key,
        value,
        mergeFieldFormatForWrite(definition.format, field?.format)
      ),
  },
  cfg_rust_1: {
    read: (content, _filePath, definition) =>
      readWhitespaceCommandContent(content, definition, ['#']),
    write: (content, key, value) => upsertWhitespaceCommandContent(content, key, value, ['#']),
  },
  xml_sdtd_1: {
    read: (content, _filePath, definition) =>
      pickDefinedFieldValues(parseSdtdXml1Content(content), definition.keys),
    write: (content, key, value) => upsertSdtdXml1Content(content, key, value),
  },
  ini_sf_1: {
    read: readKeyValueProfile('ini'),
    write: writeKeyValueProfile('ini'),
  },
  cfg_tf2_1: {
    read: (content, _filePath, definition) =>
      readWhitespaceCommandContent(content, definition, ['//']),
    write: (content, key, value) => upsertWhitespaceCommandContent(content, key, value, ['//']),
  },
};

export const parseInlineConfigProfileContent = (
  content: string,
  filePath: string,
  definition?: DefinitionLike
): Record<string, string> => {
  if (!definition) return {};

  const profileId = resolveInlineConfigProfileId(definition.format);
  if (!profileId) return {};

  return PROFILE_HANDLERS[profileId].read(content, filePath, definition);
};

export const applyInlineConfigProfileWrite = (
  content: string,
  key: string,
  value: string,
  filePath: string,
  definition?: DefinitionLike,
  field?: WritableField
): string => {
  if (!definition) {
    throw new Error(`Missing config definition for ${filePath || key}`);
  }

  const profileId = resolveInlineConfigProfileId(definition.format);
  if (!profileId) {
    throw new Error(`Unsupported or missing config format.type for ${filePath || key}`);
  }

  return PROFILE_HANDLERS[profileId].write(content, key, value, filePath, definition, field);
};
