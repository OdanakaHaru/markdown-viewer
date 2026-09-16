import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '../../types';

interface DiffSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompare: (pathA: string, pathB: string) => void;
  workspaceFiles: FileEntry[];
  currentFilePath: string | null;
}

export const DiffSelectModal: React.FC<DiffSelectModalProps> = ({
  isOpen,
  onClose,
  onCompare,
  workspaceFiles,
  currentFilePath,
}) => {
  const [targetPath, setTargetPath] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setTargetPath('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCompare = () => {
    if (currentFilePath && targetPath) {
      onCompare(currentFilePath, targetPath);
      onClose();
    }
  };

  const handleSelectExternal = async () => {
    try {
      const file = await invoke<[string, string]>('open_md_file');
      if (file && file[0]) {
        if (currentFilePath) {
          onCompare(currentFilePath, file[0]);
          onClose();
        } else {
          setTargetPath(file[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content diff-select-modal" onClick={(e) => e.stopPropagation()}>
        <h2>差分比較</h2>
        <p>現在のファイル: {currentFilePath || '（未選択）'}</p>
        
        <div className="diff-select-group">
          <label>比較先ファイルを選択</label>
          <select 
            value={targetPath} 
            onChange={(e) => setTargetPath(e.target.value)}
            className="diff-file-select"
          >
            <option value="">-- ワークスペースから選択 --</option>
            {workspaceFiles.map(f => (
              <option key={f.path} value={f.path}>
                {f.name} ({f.path})
              </option>
            ))}
          </select>
        </div>

        <div className="diff-select-actions">
          <button onClick={handleSelectExternal} className="btn btn-secondary">外部ファイルを選択...</button>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-secondary">キャンセル</button>
          <button 
            onClick={handleCompare} 
            className="btn btn-primary"
            disabled={!currentFilePath || !targetPath}
          >
            比較する
          </button>
        </div>
      </div>
    </div>
  );
};
