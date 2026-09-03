/**
 * 一意なIDを生成するユーティリティ
 * ブラウザの crypto.randomUUID が利用可能な場合はそれを使用し、
 * フォールバックとしてランダム文字列を生成します。
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
