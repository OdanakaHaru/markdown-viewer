import { useState, useCallback } from 'react';
import type { PaneItem, TabItem } from '../types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/** 閉じたタブの履歴保持上限 */
const MAX_CLOSED_TABS_HISTORY = 10;

/** 閉じたタブの履歴エントリ */
interface ClosedTabEntry {
  tab: TabItem;
  paneId: string;
}

export function usePanes() {
  const [panes, setPanes] = useState<PaneItem[]>([{ id: 'pane-1', tabs: [], activeTabId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');
  const [closedTabsHistory, setClosedTabsHistory] = useState<ClosedTabEntry[]>([]);

  // ペインのファイルが0になったらペインを閉じるかの設定
  const [autoCloseEmptyPane, setAutoCloseEmptyPane] = useState<boolean>(() => {
    const saved = localStorage.getItem('markdown_auto_close_empty_pane');
    return saved === 'true'; // デフォルトはfalse。保存されていればそれに従う
  });

  const handleAutoCloseEmptyPaneChange = useCallback((value: boolean) => {
    setAutoCloseEmptyPane(value);
    localStorage.setItem('markdown_auto_close_empty_pane', String(value));
  }, []);

  // ペインにタブを追加
  const addTabToPane = useCallback((paneId: string, tab: TabItem) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id === paneId) {
          return {
            ...pane,
            tabs: [...pane.tabs, tab],
            activeTabId: tab.id,
          };
        }
        return pane;
      })
    );
  }, []);

  // タブ選択
  const handleSelectTab = useCallback((paneId: string, tabId: string) => {
    setPanes((prev) =>
      prev.map((pane) => {
        if (pane.id === paneId) {
          return { ...pane, activeTabId: tabId };
        }
        return pane;
      })
    );
  }, []);

  // ペインを閉じる
  const handleClosePane = useCallback(
    (paneId: string) => {
      setPanes((prev) => {
        if (prev.length <= 1) return prev; // 最後の1ペインは閉じない
        return prev.filter((p) => p.id !== paneId);
      });
      setActivePaneId((prev) => {
        if (prev === paneId) {
          const remaining = panes.filter((p) => p.id !== paneId);
          return remaining.length > 0 ? remaining[remaining.length - 1].id : prev;
        }
        return prev;
      });
    },
    [panes]
  );

  // タブを閉じる
  const handleCloseTab = useCallback(
    (paneId: string, tabId: string) => {
      const currentPane = panes.find((p) => p.id === paneId);
      if (!currentPane) return;

      // 閉じるタブを履歴に保存（復元用）
      const closingTab = currentPane.tabs.find((t) => t.id === tabId);
      if (closingTab) {
        setClosedTabsHistory((prev) => {
          const newHistory = [{ tab: closingTab, paneId }, ...prev];
          return newHistory.slice(0, MAX_CLOSED_TABS_HISTORY);
        });
      }

      const newTabs = currentPane.tabs.filter((t) => t.id !== tabId);

      if (newTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
        handleClosePane(paneId);
        return;
      }

      setPanes((prev) =>
        prev.map((pane) => {
          if (pane.id === paneId) {
            let newActiveTabId = pane.activeTabId;
            if (pane.activeTabId === tabId) {
              newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
            }
            return { ...pane, tabs: newTabs, activeTabId: newActiveTabId };
          }
          return pane;
        })
      );
    },
    [panes, autoCloseEmptyPane, handleClosePane]
  );

  // ペインを右に分割
  const handleSplitPane = useCallback(
    (paneId: string) => {
      if (panes.length >= 3) return; // 最大3ペイン
      const currentPane = panes.find((p) => p.id === paneId);
      if (!currentPane) return;

      const newPaneId = `pane-${generateId()}`;
      // 現在のペインのアクティブタブをコピーして新しいペインを作成
      const activeTab = currentPane.tabs.find((t) => t.id === currentPane.activeTabId);
      const newTabs: TabItem[] = [];
      let newActiveTabId: string | null = null;

      if (activeTab) {
        const clonedTab = { ...activeTab, id: generateId() };
        newTabs.push(clonedTab);
        newActiveTabId = clonedTab.id;
      }

      const paneIndex = panes.findIndex((p) => p.id === paneId);
      const newPanes = [...panes];
      newPanes.splice(paneIndex + 1, 0, {
        id: newPaneId,
        tabs: newTabs,
        activeTabId: newActiveTabId,
      });
      setPanes(newPanes);
      setActivePaneId(newPaneId);
    },
    [panes]
  );

  // ペイン間でタブを移動
  const handleMoveTab = useCallback(
    (sourcePaneId: string, tabId: string, targetPaneId: string) => {
      if (sourcePaneId === targetPaneId) return;

      const sourcePane = panes.find((p) => p.id === sourcePaneId);
      const tabToMove = sourcePane?.tabs.find((t) => t.id === tabId);
      if (!tabToMove) return;

      const sourceNewTabs = sourcePane!.tabs.filter((t) => t.id !== tabId);

      if (sourceNewTabs.length === 0 && panes.length >= 2 && autoCloseEmptyPane) {
        setPanes((prev) => {
          let newPanes = prev.filter((p) => p.id !== sourcePaneId);
          newPanes = newPanes.map((p) => {
            if (p.id === targetPaneId) {
              return {
                ...p,
                tabs: [...p.tabs, tabToMove],
                activeTabId: tabToMove.id,
              };
            }
            return p;
          });
          return newPanes;
        });
        setActivePaneId(targetPaneId);
        return;
      }

      setPanes((prev) => {
        let newPanes = [...prev];

        newPanes = newPanes.map((p) => {
          if (p.id === sourcePaneId) {
            const newTabs = p.tabs.filter((t) => t.id !== tabId);
            let newActiveTabId = p.activeTabId;
            if (p.activeTabId === tabId) {
              newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
            }
            return { ...p, tabs: newTabs, activeTabId: newActiveTabId };
          }
          return p;
        });

        newPanes = newPanes.map((p) => {
          if (p.id === targetPaneId) {
            return {
              ...p,
              tabs: [...p.tabs, tabToMove],
              activeTabId: tabToMove.id,
            };
          }
          return p;
        });

        return newPanes;
      });
      setActivePaneId(targetPaneId);
    },
    [panes, autoCloseEmptyPane]
  );

  // --- タブナビゲーション用ヘルパー ---

  /** アクティブペインの次のタブに切り替え */
  const goToNextTab = useCallback(() => {
    const pane = panes.find((p) => p.id === activePaneId);
    if (!pane || pane.tabs.length <= 1) return;
    const currentIndex = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
    const nextIndex = (currentIndex + 1) % pane.tabs.length;
    handleSelectTab(activePaneId, pane.tabs[nextIndex].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインの前のタブに切り替え */
  const goToPrevTab = useCallback(() => {
    const pane = panes.find((p) => p.id === activePaneId);
    if (!pane || pane.tabs.length <= 1) return;
    const currentIndex = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
    const prevIndex = (currentIndex - 1 + pane.tabs.length) % pane.tabs.length;
    handleSelectTab(activePaneId, pane.tabs[prevIndex].id);
  }, [panes, activePaneId, handleSelectTab]);

  /** アクティブペインのN番目のタブに切り替え（1始まり、9は最後のタブ） */
  const goToNthTab = useCallback(
    (n: number) => {
      const pane = panes.find((p) => p.id === activePaneId);
      if (!pane || pane.tabs.length === 0) return;
      const index = n === 9 ? pane.tabs.length - 1 : Math.min(n - 1, pane.tabs.length - 1);
      handleSelectTab(activePaneId, pane.tabs[index].id);
    },
    [panes, activePaneId, handleSelectTab]
  );

  /** アクティブペインのアクティブタブを閉じる */
  const closeActiveTab = useCallback(() => {
    const pane = panes.find((p) => p.id === activePaneId);
    if (!pane || !pane.activeTabId) return;
    handleCloseTab(activePaneId, pane.activeTabId);
  }, [panes, activePaneId, handleCloseTab]);

  /** 最後に閉じたタブを復元 */
  const handleReopenClosedTab = useCallback(() => {
    if (closedTabsHistory.length === 0) return;
    const [lastClosed, ...rest] = closedTabsHistory;
    setClosedTabsHistory(rest);

    // 復元先のペインが存在するか確認。なければアクティブペインに復元
    const targetPaneId = panes.find((p) => p.id === lastClosed.paneId)
      ? lastClosed.paneId
      : activePaneId;

    const restoredTab: TabItem = {
      ...lastClosed.tab,
      id: generateId(), // 新しいIDを付与して重複を避ける
    };

    addTabToPane(targetPaneId, restoredTab);
    setActivePaneId(targetPaneId);
  }, [closedTabsHistory, panes, activePaneId, addTabToPane]);

  // 現在のアクティブペインおよびアクティブタブの参照
  const activePane = panes.find((p) => p.id === activePaneId);
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId);

  return {
    panes,
    activePaneId,
    setActivePaneId,
    activePane,
    activeTab,
    autoCloseEmptyPane,
    handleAutoCloseEmptyPaneChange,
    addTabToPane,
    handleSelectTab,
    handleClosePane,
    handleCloseTab,
    handleSplitPane,
    handleMoveTab,
    handleReopenClosedTab,
    goToNextTab,
    goToPrevTab,
    goToNthTab,
    closeActiveTab,
  };
}
