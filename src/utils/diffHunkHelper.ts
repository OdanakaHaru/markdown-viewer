import type { DiffLineDto } from '../types';

export interface DiffHunkItem {
  id: string;
  type: 'ins' | 'del' | 'mod';
  ratio: number;
  heightRatio: number;
  summary: string;
  topPx?: number;
  element?: HTMLElement | null;
  lineIdx?: number;
}

/**
 * ソース（分割）表示から差分ブロックを抽出
 */
export function extractSourceHunks(
  leftLines: DiffLineDto[] = [],
  rightLines: DiffLineDto[] = []
): DiffHunkItem[] {
  const totalLines = Math.max(leftLines.length, rightLines.length);
  if (totalLines === 0) return [];

  const hunks: DiffHunkItem[] = [];
  let currentHunk: {
    startLine: number;
    endLine: number;
    hasIns: boolean;
    hasDel: boolean;
  } | null = null;

  for (let i = 0; i < totalLines; i++) {
    const leftKind = leftLines[i]?.kind;
    const rightKind = rightLines[i]?.kind;
    const isDel = leftKind === 'delete';
    const isIns = rightKind === 'insert';

    if (isDel || isIns) {
      if (!currentHunk) {
        currentHunk = {
          startLine: i,
          endLine: i,
          hasIns: isIns,
          hasDel: isDel,
        };
      } else {
        currentHunk.endLine = i;
        if (isIns) currentHunk.hasIns = true;
        if (isDel) currentHunk.hasDel = true;
      }
    } else {
      if (currentHunk) {
        const lineCount = currentHunk.endLine - currentHunk.startLine + 1;
        const type: 'ins' | 'del' | 'mod' =
          currentHunk.hasIns && currentHunk.hasDel
            ? 'mod'
            : currentHunk.hasIns
            ? 'ins'
            : 'del';

        hunks.push({
          id: `src-hunk-${hunks.length}`,
          type,
          ratio: currentHunk.startLine / totalLines,
          heightRatio: Math.max(0.008, lineCount / totalLines),
          summary: `行 ${currentHunk.startLine + 1}: ${
            type === 'mod' ? '変更' : type === 'ins' ? '追加' : '削除'
          } (${lineCount}行)`,
          lineIdx: currentHunk.startLine,
        });
        currentHunk = null;
      }
    }
  }

  if (currentHunk) {
    const lineCount = currentHunk.endLine - currentHunk.startLine + 1;
    const type: 'ins' | 'del' | 'mod' =
      currentHunk.hasIns && currentHunk.hasDel
        ? 'mod'
        : currentHunk.hasIns
        ? 'ins'
        : 'del';

    hunks.push({
      id: `src-hunk-${hunks.length}`,
      type,
      ratio: currentHunk.startLine / totalLines,
      heightRatio: Math.max(0.008, lineCount / totalLines),
      summary: `行 ${currentHunk.startLine + 1}: ${
        type === 'mod' ? '変更' : type === 'ins' ? '追加' : '削除'
      } (${lineCount}行)`,
      lineIdx: currentHunk.startLine,
    });
  }

  return hunks;
}

/**
 * DOM要素の位置をスクロールコンテナ相対で計算
 */
function getRelativeTopAndHeight(
  el: HTMLElement,
  container: HTMLElement
): { top: number; height: number } {
  const elRect = el.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  const top = elRect.top - cRect.top + container.scrollTop;
  return {
    top: Math.max(0, top),
    height: Math.max(4, elRect.height),
  };
}

/**
 * ビジュアル表示（統合 / 分割）から差分要素を検出し、近接する要素をブロック化して抽出
 */
export function extractVisualHunks(
  container: HTMLElement | null,
  options?: {
    leftPane?: HTMLElement | null;
    rightPane?: HTMLElement | null;
  }
): DiffHunkItem[] {
  if (!container) return [];

  const isSplit = Boolean(options?.leftPane && options?.rightPane);
  const mainScrollContainer = isSplit && options?.rightPane ? options.rightPane : container;
  const scrollHeight = Math.max(mainScrollContainer.scrollHeight, 1);

  interface RawDiffEntry {
    type: 'ins' | 'del' | 'mod';
    top: number;
    height: number;
    element: HTMLElement;
  }

  const rawEntries: RawDiffEntry[] = [];

  const scanPane = (pane: HTMLElement, targetSelector: string, defaultType: 'ins' | 'del') => {
    const nodes = pane.querySelectorAll<HTMLElement>(targetSelector);
    const seen = new Set<HTMLElement>();

    nodes.forEach((el) => {
      // 非表示要素（display: none 等）は除外
      if (el.offsetParent === null && el.getClientRects().length === 0) {
        return;
      }

      // 親に既に一致する差分要素が含まれている場合は除外
      let parent = el.parentElement;
      let isNested = false;
      while (parent && parent !== pane) {
        if (parent.matches(targetSelector)) {
          isNested = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (isNested || seen.has(el)) return;
      seen.add(el);

      // 各ペイン自身のスクロール相対で位置を正確に算出
      const { top, height } = getRelativeTopAndHeight(el, pane);
      let type: 'ins' | 'del' | 'mod' = defaultType;

      if (el.matches('.diff-del, del, .mermaid-diff-del')) {
        type = 'del';
      } else if (el.matches('.diff-ins, ins, .mermaid-diff-ins')) {
        type = 'ins';
      } else if (el.matches('.mermaid-diff-mod')) {
        type = 'mod';
      }

      rawEntries.push({ type, top, height, element: el });
    });
  };

  if (isSplit && options?.leftPane && options?.rightPane) {
    // 分割表示: 左ペインは削除のみ、右ペインは追加のみを対象にして非表示要素の誤検出を防止
    scanPane(options.leftPane, '.diff-del, del, .mermaid-diff-del, .mermaid-diff-mod', 'del');
    scanPane(options.rightPane, '.diff-ins, ins, .mermaid-diff-ins, .mermaid-diff-mod', 'ins');
  } else {
    scanPane(container, '.diff-ins, .diff-del, ins, del, [class*="mermaid-diff-"]', 'ins');
  }

  if (rawEntries.length === 0) return [];

  // Y座標順にソート
  rawEntries.sort((a, b) => a.top - b.top);

  // 近接する要素（28px以内）を同一Hunkにグループ化
  const hunks: DiffHunkItem[] = [];
  let currentGroup: RawDiffEntry[] = [];

  const commitGroup = (group: RawDiffEntry[]) => {
    if (group.length === 0) return;
    const first = group[0];
    const top = first.top;
    const bottom = Math.max(...group.map((g) => g.top + g.height));
    const totalHeight = Math.max(8, bottom - top);

    const hasIns = group.some((g) => g.type === 'ins' || g.type === 'mod');
    const hasDel = group.some((g) => g.type === 'del' || g.type === 'mod');
    const type: 'ins' | 'del' | 'mod' = hasIns && hasDel ? 'mod' : hasIns ? 'ins' : 'del';

    const typeLabel = type === 'mod' ? '変更' : type === 'ins' ? '追加' : '削除';
    const summary = group.length > 1 ? `${typeLabel} (${group.length}箇所)` : typeLabel;

    hunks.push({
      id: `vis-hunk-${hunks.length}`,
      type,
      ratio: top / scrollHeight,
      heightRatio: Math.max(0.008, totalHeight / scrollHeight),
      topPx: top,
      summary,
      element: first.element,
    });
  };

  for (const entry of rawEntries) {
    if (currentGroup.length === 0) {
      currentGroup.push(entry);
    } else {
      const prev = currentGroup[currentGroup.length - 1];
      if (entry.top - (prev.top + prev.height) <= 28) {
        currentGroup.push(entry);
      } else {
        commitGroup(currentGroup);
        currentGroup = [entry];
      }
    }
  }

  commitGroup(currentGroup);

  return hunks;
}
