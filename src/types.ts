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

export interface TabItem {
  id: string;          // 一意なID (同ファイル複数展開対応)
  filePath: string;    // ファイルの絶対パス
  fileName: string;    // 表示用ファイル名
  content: string;     // パースされたHTMLまたはMarkdown
  scrollTop?: number;  // ペインごとの独立したスクロール位置（任意）
  isStandalone?: boolean; // フォルダ配下ではなく単体（D&D等）で開かれたファイルかどうか
}

export interface PaneItem {
  id: string;          // 'pane-1' | 'pane-2' | 'pane-3' 等
  tabs: TabItem[];     // このペインに属するタブ一覧
  activeTabId: string | null;
}

