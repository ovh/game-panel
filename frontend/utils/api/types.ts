interface ReleaseConfigKeyDefinition {
  title?: string | null;
  type?: string;
  options?: Array<string | { value?: string; label?: string }> | null;
  description?: string | null;
  section?: string | null;
  trueValue?: string | null;
  falseValue?: string | null;
  min?: number;
  max?: number;
  format?: ReleaseConfigKeyFormatDefinition | null;
}

export interface ReleaseConfigKeyFormatDefinition {
  type?: string | null;
  step?: number | null;
  entrySeparator?: string | null;
  keyValueSeparator?: string | null;
  quoteKeys?: boolean | null;
  quoteValues?: boolean | null;
  spacesAroundSeparator?: boolean | null;
  commentPrefixes?: string[] | null;
}

export interface ReleaseConfigFileFormatDefinition {
  type?: string;
  entrySeparator?: string | null;
  keyValueSeparator?: string | null;
  quoteKeys?: boolean | null;
  quoteValues?: boolean | null;
  spacesAroundSeparator?: boolean | null;
  commentPrefixes?: string[] | null;
}

interface CatalogLogPrompt {
  title?: string;
  match: string;
  action: string;
}

export interface CatalogNewsItem {
  id: number;
  title: string;
  description: string;
  date: number;
  type: string | null;
  iconKey: string;
  position: number;
}

export interface CatalogResourceItem {
  id: number;
  title: string;
  description: string;
  url: string;
  readTimeMinutes: number;
  category: string;
  mediaType: string;
  gameKey: string | null;
}

export interface ReleaseConfigFileDefinition {
  path?: string;
  format?: ReleaseConfigFileFormatDefinition | null;
  keys?: Record<string, ReleaseConfigKeyDefinition> | null;
}

export interface CatalogGameItem {
  shortname: string;
  gameservername: string;
  gamename: string;
  isLinuxGSMGame: boolean;
  isCheckedByAdmin: boolean;
  requireSteamCredentials?: boolean;
  requireGameCopy?: boolean;
  dockerImage: string | null;
  tcpPorts: Record<string, string> | null;
  udpPorts: Record<string, string> | null;
  healthcheck: { type: string; port?: number; name?: string } | null;
  configFiles?: ReleaseConfigFileDefinition[] | string[] | string | null;
  config_files?: ReleaseConfigFileDefinition[] | string[] | string | null;
  logPrompts?: CatalogLogPrompt[] | null;
  updatedAt?: number;
}

export interface GameUpdateCronState {
  enabled: boolean;
  schedule: string;
  line: string | null;
}
