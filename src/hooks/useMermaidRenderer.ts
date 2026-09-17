import { useEffect } from 'react';
import DOMPurify from 'dompurify';
import { mermaidPool } from '../utils/mermaidPool';
import { generateDiffMermaid, type DiffMode } from '../utils/mermaidDiff';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SVG_PURIFY_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ['style', 'foreignObject'],
  ADD_ATTR: [
    'id', 'class', 'style', 'transform', 'viewBox', 'width', 'height', 'fill',
    'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'marker-start', 'marker-mid', 'marker-end', 'd', 'points', 'x', 'y', 'x1', 'y1',
    'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'text-anchor', 'dominant-baseline',
    'font-size', 'font-family', 'font-weight', 'opacity', 'dx', 'dy', 'aria-roledescription'
  ],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
};

/**
 * 指定コンテナ内の Mermaid コードブロック（.code-block-mermaid または [data-lang="mermaid"]）を検出し、
 * プール型 iframe 経由で非同期レンダリング・ダイアグラム/コード切替UIをセットアップするフック。
 */
export function useMermaidRenderer(
  containerRef: React.RefObject<HTMLElement | null>,
  _contentDep: unknown,
  effectiveTheme: 'light' | 'dark'
) {
  useEffect(() => {
    // 過去のデバッグ用ログパネルが残っていれば除去
    document.getElementById('global-mermaid-debug')?.remove();

    const container = containerRef.current;
    if (!container) return;

    let isMounted = true;

    // 1. Mermaidブロックを抽出（クラス名、data属性、code要素のlanguageクラスを網羅的に検出）
    const blockSet = new Set<HTMLElement>();

    // .code-block-mermaid または [data-lang="mermaid"] (大文字小文字不問)
    container
      .querySelectorAll<HTMLElement>(
        '.code-block-mermaid, [data-lang="mermaid" i]'
      )
      .forEach((el) => blockSet.add(el));

    // pre > code[class*="language-mermaid"] の親ブロックも網羅的に検出
    container
      .querySelectorAll<HTMLElement>('pre > code[class*="language-mermaid"], pre > code[data-lang="mermaid" i]')
      .forEach((codeEl) => {
        const parentBlock =
          codeEl.closest<HTMLElement>('.code-block-container') ||
          codeEl.closest<HTMLElement>('pre') ||
          (codeEl.parentElement as HTMLElement);
        if (parentBlock) {
          parentBlock.classList.add('code-block-mermaid');
          blockSet.add(parentBlock);
        }
      });

    const mermaidBlocks = Array.from(blockSet);

    if (mermaidBlocks.length === 0) {
      return;
    }

    try {
      mermaidBlocks.forEach((block) => {
        // 構造化（未初期化の場合）
        let diagramWrap = block.querySelector<HTMLElement>('.mermaid-diagram-wrap');
        let codeWrap = block.querySelector<HTMLElement>('.mermaid-code-wrap');

        if (!diagramWrap || !codeWrap) {
          const header = block.querySelector<HTMLElement>('.code-block-header');
          const pre = block.querySelector<HTMLPreElement>('pre');
          if (!pre) {
            return;
          }

          // 元コードを取得してブロックのデータ属性に保存
          const codeEl = pre.querySelector('code');
          const rawCode = (codeEl ? codeEl.textContent : pre.textContent) || '';
          block.dataset.mermaidCode = rawCode;

          const diffMode = block.dataset.diffMode as DiffMode | undefined;
          const isDiff = Boolean(diffMode);

          // ヘッダーUIの整備（トグルボタンの追加）
          if (header && !header.classList.contains('mermaid-header')) {
            header.classList.add('mermaid-header');
            const langSpan = header.querySelector('.code-block-lang');
            const copyBtn = header.querySelector('.code-block-copy-btn');

            // ヘッダー左側（言語名 + トグル）
            const leftWrap = document.createElement('div');
            leftWrap.className = 'mermaid-header-left';
            if (langSpan) {
              if (isDiff) {
                langSpan.textContent = 'mermaid diff';
                langSpan.classList.add('mermaid-diff-tag');
              }
              leftWrap.appendChild(langSpan);
            }

            const toggleWrap = document.createElement('div');
            toggleWrap.className = 'mermaid-view-toggle';
            const diagramLabel = isDiff
              ? diffMode === 'unified'
                ? '差分ダイアグラム(合成)'
                : diffMode === 'left'
                ? 'ダイアグラム(削除表示)'
                : 'ダイアグラム(追加表示)'
              : 'ダイアグラム';

            toggleWrap.innerHTML = `
              <button type="button" class="mermaid-toggle-btn active" data-view="diagram">${diagramLabel}</button>
              <button type="button" class="mermaid-toggle-btn" data-view="code">コード</button>
            `;
            leftWrap.appendChild(toggleWrap);

            // ヘッダー右側（コピーボタン）
            const rightWrap = document.createElement('div');
            rightWrap.className = 'mermaid-header-right';
            if (copyBtn) {
              rightWrap.appendChild(copyBtn);
            }

            header.innerHTML = '';
            header.appendChild(leftWrap);
            header.appendChild(rightWrap);
          }

          // 本文コンテナの整備（ダイアグラム領域 + コード領域）
          diagramWrap = document.createElement('div');
          diagramWrap.className = 'mermaid-diagram-wrap';

          codeWrap = document.createElement('div');
          codeWrap.className = 'mermaid-code-wrap';
          codeWrap.style.display = 'none'; // 初期状態は非表示（ダイアグラムを優先）

          // pre要素をcodeWrap内に移動
          block.insertBefore(diagramWrap, pre);
          block.insertBefore(codeWrap, pre);
          codeWrap.appendChild(pre);
        }

        // レンダリング実行判定（テーマ変更時、または未レンダリング時）
        const baseRawCode = block.dataset.mermaidCode || '';
        const diffMode = block.dataset.diffMode as DiffMode | undefined;

        let codeToRender = baseRawCode;
        if (diffMode) {
          const oldCode = block.dataset.mermaidOld ? decodeURIComponent(block.dataset.mermaidOld) : '';
          const newCode = block.dataset.mermaidNew ? decodeURIComponent(block.dataset.mermaidNew) : '';
          codeToRender = generateDiffMermaid({
            oldCode,
            newCode,
            mode: diffMode,
            theme: effectiveTheme,
          });
        }

        if (!codeToRender.trim()) {
          return;
        }

        const renderedTheme = block.dataset.renderedTheme;
        if (renderedTheme === effectiveTheme && block.dataset.renderedSuccess === 'true') {
          return;
        }

        // ローディング状態表示
        diagramWrap.innerHTML = `
          <div class="mermaid-loading">
            <div class="mermaid-spinner"></div>
            <span>Mermaidを描画中...</span>
          </div>
        `;

        // 非同期レンダリング
        mermaidPool
          .render(codeToRender, effectiveTheme)
          .then((svg) => {
            if (!isMounted || !block.isConnected || !diagramWrap) return;
            const sanitizedSvg = DOMPurify.sanitize(svg, SVG_PURIFY_CONFIG);
            diagramWrap.innerHTML = sanitizedSvg;
            block.dataset.renderedTheme = effectiveTheme;
            block.dataset.renderedSuccess = 'true';
          })
          .catch((err: unknown) => {
            if (!isMounted || !block.isConnected || !diagramWrap) return;
            const errMsg = err instanceof Error ? err.message : String(err);
            diagramWrap.innerHTML = `
              <div class="mermaid-error-banner">
                <div class="mermaid-error-title">
                  <span>⚠️</span>
                  <span>Mermaidの描画に失敗しました</span>
                </div>
                <div class="mermaid-error-msg">${escapeHtml(errMsg)}</div>
              </div>
            `;
            block.dataset.renderedTheme = effectiveTheme;
            block.dataset.renderedSuccess = 'false';
          });
      });
    } catch (err) {
      console.error('Failed to initialize Mermaid blocks:', err);
    }

    // 2. 表示切替トグル（ダイアグラム / コード）のクリックイベント処理
    const handleToggleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const toggleBtn = target.closest<HTMLButtonElement>('.mermaid-toggle-btn');
      if (!toggleBtn) return;

      const block = toggleBtn.closest<HTMLElement>('.code-block-mermaid, .code-block-container');
      if (!block) return;

      const view = toggleBtn.dataset.view; // "diagram" | "code"
      if (!view) return;

      const allBtns = block.querySelectorAll<HTMLButtonElement>('.mermaid-toggle-btn');
      allBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });

      const diagramWrap = block.querySelector<HTMLElement>('.mermaid-diagram-wrap');
      const codeWrap = block.querySelector<HTMLElement>('.mermaid-code-wrap');

      if (view === 'diagram') {
        if (diagramWrap) diagramWrap.style.display = 'flex';
        if (codeWrap) codeWrap.style.display = 'none';
      } else {
        if (diagramWrap) diagramWrap.style.display = 'none';
        if (codeWrap) codeWrap.style.display = 'block';
      }
    };

    container.addEventListener('click', handleToggleClick);

    return () => {
      isMounted = false;
      container.removeEventListener('click', handleToggleClick);
    };
  }); // 依存配列を削除し、毎回のレンダリング後に実行してDOMがReactによって上書きされた場合（再レンダリング時）に復旧できるようにする
}
