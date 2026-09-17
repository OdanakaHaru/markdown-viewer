import mermaid from 'mermaid';

let currentTheme: 'light' | 'dark' | null = null;

function updateTheme(theme: 'light' | 'dark') {
  if (currentTheme === theme) return;
  currentTheme = theme;
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

// 初期化（デフォルトはlight）
updateTheme('light');

window.addEventListener('message', async (event: MessageEvent) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'ping') {
    window.parent.postMessage({ type: 'mermaid-ready' }, '*');
    return;
  }

  if (data.type === 'render') {
    const { id, code, theme } = data;
    const safeRenderId = `mermaid_${String(id).replace(/[^a-zA-Z0-9_]/g, '_')}_${Date.now()}`;
    const container = document.getElementById('container') || document.body;

    try {
      updateTheme(theme === 'dark' ? 'dark' : 'light');
      const { svg } = await mermaid.render(safeRenderId, code, container);
      window.parent.postMessage({ type: 'render-success', id, svg }, '*');
    } catch (err: unknown) {
      try {
        const stray = document.querySelectorAll(`[id^="${safeRenderId}"], [id^="d${safeRenderId}"]`);
        stray.forEach((el) => el.remove());
      } catch {
        // ignore
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      window.parent.postMessage({ type: 'render-error', id, error: errorMessage }, '*');
    } finally {
      container.innerHTML = '';
    }
  }
});

// 親ウィンドウに初期化完了を通知
window.parent.postMessage({ type: 'mermaid-ready' }, '*');
