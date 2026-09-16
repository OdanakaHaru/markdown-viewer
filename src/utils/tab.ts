import type { PaneItem, TabItem } from '../types';
import { normalizePath } from './path';

/**
 * 全ペインから指定ファイルパスに一致するタブを検索する
 *
 * @param panes ペイン一覧
 * @param filePath 検索対象のファイルパス
 * @returns 見つかった場合は `{ paneId, tab }`、見つからない場合は `null`
 */
export function findTabByPath(
  panes: PaneItem[],
  filePath: string
): { paneId: string; tab: TabItem } | null {
  const normTarget = normalizePath(filePath);
  for (const pane of panes) {
    const tab = pane.tabs.find((t) => normalizePath(t.filePath) === normTarget);
    if (tab) {
      return { paneId: pane.id, tab };
    }
  }
  return null;
}

/**
 * タブを閉じた（または移動した）後の次のアクティブタブIDを決定する
 *
 * - 閉じる対象のタブがアクティブでない場合は、現在のアクティブタブIDを維持します。
 * - 閉じる対象のタブがアクティブだった場合は、残ったタブの末尾のタブIDを選択します（タブが無ければ null）。
 *
 * @param tabs タブ一覧（閉じる対象を含むタブ配列、または既に除外済みのタブ配列）
 * @param closingTabId 閉じる対象のタブID
 * @param currentActiveTabId 現在のアクティブタブID（省略時は closingTabId とみなし、閉じられたと判定）
 * @returns 次のアクティブタブID、またはタブが残っていない場合は `null`
 */
export function getNextActiveTabId(
  tabs: TabItem[],
  closingTabId: string,
  currentActiveTabId: string | null = closingTabId
): string | null {
  if (currentActiveTabId !== closingTabId) {
    return currentActiveTabId;
  }
  const remainingTabs = tabs.filter((t) => t.id !== closingTabId);
  return remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null;
}

/**
 * 1始まりのインデックス番号から該当するタブを取得する
 *
 * - 1〜8番目は指定されたインデックス位置のタブを取得します。
 * - 9番目は末尾（最後のタブ）を取得します（一般的なタブUI・ブラウザのショートカット互換）。
 *
 * @param tabs タブ一覧
 * @param n タブ番号（1〜9）
 * @returns 該当するタブ、または存在しない場合は `null`
 */
export function getTabByIndex(tabs: TabItem[], n: number): TabItem | null {
  if (!tabs || tabs.length === 0 || n < 1) {
    return null;
  }
  const index = n === 9 ? tabs.length - 1 : Math.min(n - 1, tabs.length - 1);
  return tabs[index] ?? null;
}
