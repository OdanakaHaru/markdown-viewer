/**
 * パス文字列を比較・探索用に正規化する（バックスラッシュをスラッシュに置換して小文字化）
 */
export function normalizePath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').toLowerCase();
}

/**
 * Markdownファイルの拡張子かどうかを判定する
 */
export function isMarkdownFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.mdown') ||
    lower.endsWith('.mkd') ||
    lower.endsWith('.mdx')
  );
}

/**
 * 見出し文字列からアンカーID（スラッグ）を生成する
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u00A0-\uFFFF -]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * ファイルパスから親ディレクトリのパスを取得する
 */
export function getParentDirPath(filePath: string): string | null {
  const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastIndex <= 0) return null;
  return filePath.substring(0, lastIndex);
}

/**
 * ファイルパスまたはディレクトリパスから末尾のディレクトリ名/ファイル名を取得する
 */
export function getPathBaseName(pathStr: string): string {
  return pathStr.split(/[/\\]/).filter(Boolean).pop() || pathStr;
}

/**
 * filePath が targetDirPath の配下にあるかどうかを判定する
 */
export function isSubpathOf(filePath: string, targetDirPath: string): boolean {
  const normFile = normalizePath(filePath);
  const normDir = normalizePath(targetDirPath).replace(/\/+$/, '');
  return normFile === normDir || normFile.startsWith(normDir + '/');
}
