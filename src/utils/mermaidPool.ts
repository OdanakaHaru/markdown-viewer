/**
 * ダイナミックインポート型 Mermaid レンダラー管理シングルトン
 * メインバンドルへの Mermaid 非包含を維持し、初回描画時に遅延ロードする。
 * 非表示の DOM コンテナを使用してレンダリングし、SVG 文字列を取得する。
 */

// Mermaidの型（ダイナミックインポート用）
type MermaidAPI = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string, container?: Element) => Promise<{ svg: string }>;
};

export class MermaidPool {
  private mermaid: MermaidAPI | null = null;
  private loadPromise: Promise<MermaidAPI> | null = null;
  private currentTheme: 'light' | 'dark' | null = null;
  private cache = new Map<string, string>();
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reqCounter = 0;

  // 3分（180秒）のアイドル自動破棄
  private readonly IDLE_TTL = 3 * 60 * 1000;

  /**
   * Mermaid をダイナミックインポートで遅延ロード
   */
  private async loadMermaid(): Promise<MermaidAPI> {
    if (this.mermaid) return this.mermaid;

    if (!this.loadPromise) {
      this.loadPromise = import('mermaid').then((mod) => {
        const mermaid = mod.default;
        this.mermaid = mermaid;
        return mermaid;
      });
    }

    return this.loadPromise;
  }

  /**
   * テーマの更新（変更時のみ再初期化）
   */
  private updateTheme(mermaid: MermaidAPI, theme: 'light' | 'dark') {
    if (this.currentTheme === theme) return;
    this.currentTheme = theme;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: theme === 'dark' ? 'dark' : 'default',
      themeVariables: theme === 'dark' ? {
        darkMode: true,
        background: '#0d1117',
      } : {
        darkMode: false,
      },
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
  }

  /**
   * レンダリング用の非表示コンテナを確保
   */
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = `feathermark-mermaid-render-container-${++this.reqCounter}`;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '1200px';
    container.style.height = '800px';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
    return container;
  }

  private resetIdleTimer() {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    this.idleTimeoutId = setTimeout(() => {
      this.destroy();
    }, this.IDLE_TTL);
  }

  /**
   * Mermaid 図をレンダリングして SVG 文字列を取得
   */
  public async render(code: string, theme: 'light' | 'dark'): Promise<string> {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      return '';
    }

    const cacheKey = `${theme}:::${trimmedCode}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.resetIdleTimer();
      return cached;
    }

    // Mermaid を遅延ロード
    const mermaid = await this.loadMermaid();
    this.updateTheme(mermaid, theme);
    this.resetIdleTimer();

    const container = this.createContainer();
    const renderId = `mermaid_render_${this.reqCounter}_${Date.now()}`;

    try {
      const { svg } = await mermaid.render(renderId, trimmedCode, container);
      this.cache.set(cacheKey, svg);
      return svg;
    } catch (err: unknown) {
      // レンダリング失敗時の残留DOM要素を除去
      try {
        const stray = document.querySelectorAll(`[id^="${renderId}"], [id^="d${renderId}"]`);
        stray.forEach((el) => el.remove());
      } catch {
        // ignore
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(errorMessage);
    } finally {
      // コンテナを破棄
      if (container.isConnected) {
        container.remove();
      }
    }
  }

  /**
   * リソースを完全解放（3分アイドル時または明示的呼出し）
   */
  public destroy() {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    this.cache.clear();
    this.currentTheme = null;
    // mermaid モジュール自体は保持（再ロードは高コスト）
  }
}

export const mermaidPool = new MermaidPool();
