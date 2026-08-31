import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  baseFilePath?: string | null;
  baseFolderPath?: string | null;
}

const isTauri = '__TAURI_INTERNALS__' in window;

function isRemoteOrDataUrl(src: string): boolean {
  const lower = src.trim().toLowerCase();
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:')
  );
}

/**
 * Markdown記法内の画像を安全かつ適切に解決して表示するコンポーネント
 */
export function MarkdownImage({
  src,
  alt,
  title,
  baseFilePath,
  baseFolderPath,
  className,
  ...props
}: MarkdownImageProps) {
  const trimmedSrc = src?.trim() || '';
  const isDirectSrc = !trimmedSrc || isRemoteOrDataUrl(trimmedSrc) || !isTauri;

  const [localDataUrl, setLocalDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!isDirectSrc);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    !trimmedSrc ? '画像パスが指定されていません' : null
  );

  useEffect(() => {
    if (isDirectSrc) {
      return;
    }

    let isMounted = true;

    invoke<string>('read_image_data_url', {
      baseFilePath: baseFilePath || null,
      baseFolderPath: baseFolderPath || null,
      src: trimmedSrc,
    })
      .then((dataUrl) => {
        if (isMounted) {
          setLocalDataUrl(dataUrl);
          setIsLoading(false);
          setErrorMsg(null);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setIsLoading(false);
          const msg =
            typeof err === 'string' ? err : '画像の読み込みに失敗しました';
          setErrorMsg(msg);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [trimmedSrc, baseFilePath, baseFolderPath, isDirectSrc]);

  if (!trimmedSrc || errorMsg) {
    return (
      <span className="markdown-image-fallback" title={`${errorMsg || '画像を表示できません'} (${src})`}>
        <span className="fallback-icon">🖼️</span>
        <span className="fallback-label">{alt || '画像を表示できません'}</span>
        {trimmedSrc && <span className="fallback-path">{trimmedSrc}</span>}
      </span>
    );
  }

  if (isLoading) {
    return (
      <span className="markdown-image-loading">
        <span className="loading-spinner" />
        <span className="loading-text">画像を読み込み中...</span>
      </span>
    );
  }

  const effectiveSrc = isDirectSrc ? trimmedSrc : localDataUrl || undefined;

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      title={title}
      className={`markdown-rendered-image ${className || ''}`}
      loading="lazy"
      onError={() => {
        setErrorMsg('画像データの描画に失敗しました');
      }}
      {...props}
    />
  );
}

