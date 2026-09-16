import type { TocItem } from '../types';
import { slugify } from './path';

/**
 * 見出し要素用の識別子（ID）を取得または生成する
 *
 * 既存のIDが設定されている場合はそれを優先し、未設定の場合はインデックスとテキストのスラッグからIDを生成します。
 *
 * @param index 見出しの連番インデックス（0始まり）
 * @param text 見出しのテキスト内容
 * @param existingId 要素に既に設定されているID（任意）
 * @returns 見出し用ID
 */
export function getHeadingId(index: number, text: string, existingId?: string | null): string {
  if (existingId && existingId.trim().length > 0) {
    return existingId;
  }
  return `heading-${index}-${slugify(text || '')}`;
}

/**
 * HTML文字列から見出し要素（h1〜h6）を抽出し、目次（TOC）アイテムの配列を生成する純粋関数
 *
 * ブラウザ標準の DOMParser を用いてHTMLをパースし、見出しレベル、テキスト、IDを抽出します。
 *
 * @param htmlContent パース対象のHTML文字列
 * @returns 目次アイテム（TocItem）の配列
 */
export function extractTocItems(htmlContent: string): TocItem[] {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const items: TocItem[] = [];

  headings.forEach((el, index) => {
    const level = parseInt(el.tagName.substring(1), 10);
    const text = (el.textContent || '').trim();
    const id = getHeadingId(index, text, el.id);

    items.push({
      id,
      text,
      level,
    });
  });

  return items;
}
