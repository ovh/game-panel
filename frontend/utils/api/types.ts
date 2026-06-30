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

interface ReleaseConfigKeyFormatDefinition {
  type?: string | null;
  step?: number | null;
  entrySeparator?: string | null;
  keyValueSeparator?: string | null;
  quoteKeys?: boolean | null;
  quoteValues?: boolean | null;
  spacesAroundSeparator?: boolean | null;
  commentPrefixes?: string[] | null;
}

interface ReleaseConfigFileFormatDefinition {
  type?: string;
  entrySeparator?: string | null;
  keyValueSeparator?: string | null;
  quoteKeys?: boolean | null;
  quoteValues?: boolean | null;
  spacesAroundSeparator?: boolean | null;
  commentPrefixes?: string[] | null;
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
  category: string;
  mediaType: string;
  gameKey: string | null;
}

export interface ReleaseConfigFileDefinition {
  path?: string;
  format?: ReleaseConfigFileFormatDefinition | null;
  keys?: Record<string, ReleaseConfigKeyDefinition> | null;
}

