import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ContextMenuItem, ContextMenuState } from '../types';
import { ChevronRightIcon } from './Icons';

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ state, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x: state.x, y: state.y });
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const submenuTimeoutRef = useRef<number | null>(null);

  // ウィンドウ端での見切れ防止（スマート配置計算）
  useEffect(() => {
    if (!state.isOpen || !menuRef.current) return;

    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const padding = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = state.x;
    let newY = state.y;

    if (newX + rect.width > viewportWidth - padding) {
      newX = Math.max(padding, viewportWidth - rect.width - padding);
    }
    if (newY + rect.height > viewportHeight - padding) {
      newY = Math.max(padding, viewportHeight - rect.height - padding);
    }

    setAdjustedPos({ x: newX, y: newY });
  }, [state.isOpen, state.x, state.y, state.items]);

  // 外側クリック、ESCキー、ウィンドウリサイズ、スクロールでメニューを閉じる
  useEffect(() => {
    if (!state.isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleWindowChange = () => {
      onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [state.isOpen, onClose]);

  const handleMouseEnterItem = useCallback((item: ContextMenuItem) => {
    if (submenuTimeoutRef.current) {
      window.clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    if (item.children && item.children.length > 0) {
      setActiveSubmenuId(item.id);
    } else {
      setActiveSubmenuId(null);
    }
  }, []);

  const handleMouseLeaveMenu = useCallback(() => {
    submenuTimeoutRef.current = window.setTimeout(() => {
      setActiveSubmenuId(null);
    }, 250);
  }, []);

  if (!state.isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: `${adjustedPos.x}px`,
        top: `${adjustedPos.y}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={handleMouseLeaveMenu}
      role="menu"
      aria-label="コンテキストメニュー"
    >
      {state.title && (
        <div className="context-menu-title" title={state.title}>
          {state.title}
        </div>
      )}

      {state.items.map((item) => {
        if (item.divider) {
          return <div key={item.id} className="context-menu-divider" role="separator" />;
        }

        const hasSubmenu = Boolean(item.children && item.children.length > 0);
        const isSubmenuOpen = activeSubmenuId === item.id;

        return (
          <div
            key={item.id}
            className={`context-menu-item-wrapper ${hasSubmenu ? 'has-submenu' : ''}`}
            onMouseEnter={() => handleMouseEnterItem(item)}
          >
            <button
              type="button"
              className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${
                item.danger ? 'danger' : ''
              } ${isSubmenuOpen ? 'active' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                if (!hasSubmenu && item.onClick) {
                  const clickHandler = item.onClick;
                  onClose();
                  window.setTimeout(() => {
                    clickHandler();
                  }, 10);
                } else if (hasSubmenu) {
                  setActiveSubmenuId((prev) => (prev === item.id ? null : item.id));
                }
              }}
              role="menuitem"
            >
              {item.icon && <span className="context-menu-icon">{item.icon}</span>}
              <span className="context-menu-label">{item.label}</span>
              {item.shortcut && <kbd className="context-menu-shortcut">{item.shortcut}</kbd>}
              {hasSubmenu && (
                <span className="context-menu-arrow">
                  <ChevronRightIcon />
                </span>
              )}
            </button>

            {/* サブメニュー */}
            {hasSubmenu && isSubmenuOpen && item.children && (
              <SubMenu items={item.children} onClose={onClose} />
            )}
          </div>
        );
      })}
    </div>
  );
};

interface SubMenuProps {
  items: ContextMenuItem[];
  onClose: () => void;
}

const SubMenu: React.FC<SubMenuProps> = ({ items, onClose }) => {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [flipLeft, setFlipLeft] = useState(false);

  useEffect(() => {
    if (!submenuRef.current) return;
    const subRect = submenuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // 右側に見切れる場合は左側に反転表示
    if (subRect.right > viewportWidth - 8) {
      setFlipLeft(true);
    }
  }, []);

  return (
    <div
      ref={submenuRef}
      className={`context-submenu ${flipLeft ? 'flip-left' : ''}`}
      role="menu"
    >
      {items.map((subItem) => {
        if (subItem.divider) {
          return <div key={subItem.id} className="context-menu-divider" role="separator" />;
        }

        return (
          <button
            key={subItem.id}
            type="button"
            className={`context-menu-item ${subItem.disabled ? 'disabled' : ''} ${
              subItem.danger ? 'danger' : ''
            }`}
            disabled={subItem.disabled}
            onClick={() => {
              if (subItem.disabled) return;
              if (subItem.onClick) {
                const clickHandler = subItem.onClick;
                onClose();
                window.setTimeout(() => {
                  clickHandler();
                }, 10);
              }
            }}
            role="menuitem"
          >
            {subItem.icon && <span className="context-menu-icon">{subItem.icon}</span>}
            <span className="context-menu-label">{subItem.label}</span>
            {subItem.shortcut && (
              <kbd className="context-menu-shortcut">{subItem.shortcut}</kbd>
            )}
          </button>
        );
      })}
    </div>
  );
};
