export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_markdown: boolean;
}

export interface ResolvedLink {
  kind: 'url' | 'markdown' | 'file' | 'anchor' | 'markdown_not_found' | 'not_found' | 'unknown';
  target: string;
  hash?: string | null;
}

export type ThemeMode = 'light' | 'dark' | 'system';

