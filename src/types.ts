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
  isDiff?: boolean;    // Diff仮想タブかどうか
  isGitDiff?: boolean; // Git Diff仮想タブかどうか
  gitRevision?: string; // 比較対象のGitリビジョン（例: 'HEAD'）
  gitFilePath?: string; // 対象ファイルのローカル絶対パス
  diffResult?: DiffResult; // Diff結果データ
  diffViewMode?: DiffViewMode; // 'visual' または 'split'
}

export interface GitStatusInfo {
  is_git_available: boolean;
  is_repo: boolean;
  has_head: boolean;
  is_tracked: boolean;
  relative_path?: string | null;
  repo_root?: string | null;
  branch?: string | null;
}

export interface GitCommitInfo {
  hash: string;
  short_hash: string;
  author: string;
  relative_date: string;
  date: string;
  summary: string;
}



export type DiffViewMode = 'visual' | 'split' | 'split-visual';

export interface DiffLineDto {
  kind: string; // 'equal' | 'delete' | 'insert'
  text: string;
  line_idx: number | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface DiffResult {
  unified_html: string;
  old_html: string;
  new_html: string;
  left_lines: DiffLineDto[];
  right_lines: DiffLineDto[];
  stats: DiffStats;
}

export interface PaneItem {
  id: string;          // 'pane-1' | 'pane-2' | 'pane-3' 等
  tabs: TabItem[];     // このペインに属するタブ一覧
  activeTabId: string | null;
}

export interface TocItem {
  id: string;          // 見出しの要素ID（アンカー）
  text: string;        // 見出しのテキスト内容
  level: number;       // 1 〜 6
}

export type SidebarView = 'explorer' | 'toc';

export interface QuickOpenFileItem {
  name: string;
  path: string;
  relative_path: string;
}

export interface CustomApp {
  id: string;
  name: string;
  appType: 'vscode' | 'custom';
  path?: string;
}

export type ExternalAppType = 'vscode' | 'notepad' | 'default' | 'custom';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
  children?: ContextMenuItem[];
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
}

