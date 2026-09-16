import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '../../types';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  MarkdownFileIcon,
  GenericFileIcon,
} from '../common/Icons';

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  collapseAllTrigger: number;
  onContextMenu?: (e: React.MouseEvent, entry: FileEntry) => void;
}

export const FileTreeItem: React.FC<FileTreeItemProps> = ({
  entry,
  depth,
  selectedPath,
  onSelectFile,
  collapseAllTrigger,
  onContextMenu,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadChildren = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await invoke<FileEntry[]>('read_directory', { path: entry.path });
      setChildren(items);
    } catch (err) {
      console.error(`Failed to read directory: ${entry.path}`, err);
      setChildren([]);
    } finally {
      setIsLoading(false);
    }
  }, [entry.path]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry.is_dir) {
      if (entry.is_markdown) {
        onSelectFile(entry.path);
      }
      return;
    }

    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);
    if (nextExpanded && children === null) {
      await loadChildren();
    }
  };

  const isSelected = selectedPath === entry.path;
  const paddingLeft = 12 + depth * 16;

  return (
    <div className="tree-node">
      <div
        className={`tree-item ${entry.is_dir ? 'is-dir' : 'is-file'} ${
          isSelected ? 'selected' : ''
        } ${!entry.is_dir && !entry.is_markdown ? 'non-markdown' : ''}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleToggle}
        onContextMenu={(e) => {
          if (onContextMenu) {
            onContextMenu(e, entry);
          }
        }}
        title={entry.path}
        draggable={!entry.is_dir && entry.is_markdown}
        onDragStart={(e) => {
          if (!entry.is_dir && entry.is_markdown) {
            e.dataTransfer.setData(
              'application/json',
              JSON.stringify({ type: 'file', filePath: entry.path })
            );
            e.dataTransfer.effectAllowed = 'copy';
          }
        }}
      >
        <span className="tree-arrow">
          {entry.is_dir ? (
            isExpanded ? (
              <ChevronDownIcon className="arrow-icon" />
            ) : (
              <ChevronRightIcon className="arrow-icon" />
            )
          ) : (
            <span className="arrow-placeholder" />
          )}
        </span>

        <span className="tree-icon">
          {entry.is_dir ? (
            isExpanded ? (
              <FolderOpenIcon className="folder-icon" />
            ) : (
              <FolderClosedIcon className="folder-icon" />
            )
          ) : entry.is_markdown ? (
            <MarkdownFileIcon className="file-icon md-icon" />
          ) : (
            <GenericFileIcon className="file-icon" />
          )}
        </span>

        <span className="tree-label">{entry.name}</span>
        {isLoading && <span className="tree-loading">...</span>}
      </div>

      {entry.is_dir && isExpanded && (
        <div className="tree-children">
          {children && children.length > 0 ? (
            children.map((child) => (
              <FileTreeItem
                key={`${child.path}-${collapseAllTrigger}`}
                entry={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                collapseAllTrigger={collapseAllTrigger}
                onContextMenu={onContextMenu}
              />
            ))
          ) : children && children.length === 0 && !isLoading ? (
            <div
              className="tree-empty"
              style={{ paddingLeft: `${paddingLeft + 20}px` }}
            >
              (空のフォルダ)
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
