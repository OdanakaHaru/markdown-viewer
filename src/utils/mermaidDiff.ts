/**
 * Mermaid差分解析および合成コード生成ユーティリティ
 */

export type DiffMode = 'unified' | 'left' | 'right';

export interface MermaidDiffOptions {
  oldCode: string;
  newCode: string;
  mode: DiffMode;
  theme: 'light' | 'dark';
}

/**
 * テーマに応じた classDef 定義文字列を生成
 */
function getClassDefs(theme: 'light' | 'dark', kinds: ('diffAdded' | 'diffDeleted' | 'diffUnchanged')[]): string {
  const isDark = theme === 'dark';
  const defs: string[] = [];

  for (const kind of kinds) {
    if (kind === 'diffAdded') {
      defs.push(
        isDark
          ? '    classDef diffAdded fill:#064e3b,stroke:#10b981,stroke-width:2.5px,color:#ecfdf5;'
          : '    classDef diffAdded fill:#dcfce7,stroke:#16a34a,stroke-width:2.5px,color:#14532d;'
      );
    } else if (kind === 'diffDeleted') {
      defs.push(
        isDark
          ? '    classDef diffDeleted fill:#450a0a,stroke:#f87171,stroke-width:2px,stroke-dasharray: 5 5,color:#fef2f2;'
          : '    classDef diffDeleted fill:#fee2e2,stroke:#dc2626,stroke-width:2px,stroke-dasharray: 5 5,color:#7f1d1d;'
      );
    } else if (kind === 'diffUnchanged') {
      defs.push(
        isDark
          ? '    classDef diffUnchanged fill:#1e293b,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;'
          : '    classDef diffUnchanged fill:#f8fafc,stroke:#94a3b8,stroke-width:1.5px,color:#0f172a;'
      );
    }
  }

  return defs.join('\n');
}


/**
 * 行から予約語や特殊キーワードを除外し、ノードIDを抽出する
 */
const RESERVED_KEYWORDS = new Set([
  'graph', 'flowchart', 'subgraph', 'end', 'direction',
  'tb', 'td', 'bt', 'rl', 'lr',
  'classdef', 'class', 'linkstyle', 'style', 'click', 'interpolate',
  'call', 'callback', 'acctitle', 'accdescr', 'mermaid'
]);

function extractNodeIdsFromLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('%%')) return [];

  // subgraph や classDef 行はスキップ
  const firstWord = trimmed.split(/[\s(;:]/)[0]?.toLowerCase();
  if (RESERVED_KEYWORDS.has(firstWord)) {
    return [];
  }

  const nodeIds: string[] = [];

  // 1. ノード定義パターン: NodeId[ラベル] や NodeId(ラベル) 等（括弧全体を消費してラベル内テキストへの誤マッチを防止）
  const defRegex = /([a-zA-Z0-9_$-]+)\s*(?:\[(?:[^\]]|\\\])*\]|\((?:[^)]|\\\))*\)|\{(?:[^}]|\\\})*\}|>(?:[^\]]|\\\])*\])/g;
  let match: RegExpExecArray | null;
  while ((match = defRegex.exec(trimmed)) !== null) {
    const id = match[1];
    if (!RESERVED_KEYWORDS.has(id.toLowerCase()) && !nodeIds.includes(id)) {
      nodeIds.push(id);
    }
  }

  // 2. 矢印接続パターンの抽出前に、ラベル文字列（[ ... ], ( ... ), " ... ", | ... |）を除去して誤検出を防ぐ
  const lineWithoutLabels = trimmed
    .replace(/\[(?:[^\]]|\\\])*\]/g, ' ')
    .replace(/\((?:[^)]|\\\))*\)/g, ' ')
    .replace(/\{(?:[^}]|\\\})*\}/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/\|(?:[^|\\]|\\.)*\|/g, ' ');

  // 3. 単独ノード接続パターン: A --> B や A --- B
  const arrowRegex = /([a-zA-Z0-9_$-]+)\s*(?:[-.=>]{2,}|[-.]{1,2}\s*[a-zA-Z0-9_$-]*\s*[-.=>]{1,2})\s*([a-zA-Z0-9_$-]+)/g;
  while ((match = arrowRegex.exec(lineWithoutLabels)) !== null) {
    const leftId = match[1];
    const rightId = match[2];
    if (!RESERVED_KEYWORDS.has(leftId.toLowerCase()) && !nodeIds.includes(leftId)) {
      nodeIds.push(leftId);
    }
    if (!RESERVED_KEYWORDS.has(rightId.toLowerCase()) && !nodeIds.includes(rightId)) {
      nodeIds.push(rightId);
    }
  }

  return nodeIds;
}

/**
 * コード全体から出現するすべてのノードIDを抽出
 */
function extractAllNodeIds(code: string): Set<string> {
  const ids = new Set<string>();
  const lines = code.split('\n');
  for (const line of lines) {
    for (const id of extractNodeIdsFromLine(line)) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * フローチャートのヘッダー行（flowchart TD / graph LRなど）を抽出
 */
function extractFlowchartHeader(code: string): string {
  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(flowchart|graph)\s+/i.test(trimmed)) {
      return trimmed;
    }
  }
  return 'flowchart TD';
}

/**
 * 新旧 Mermaid コードから差分を表現した合成/色分け Mermaid コードを生成
 */
export function generateDiffMermaid({
  oldCode,
  newCode,
  mode,
  theme
}: MermaidDiffOptions): string {
  const cleanOld = (oldCode || '').trim();
  const cleanNew = (newCode || '').trim();

  // 片方しかない場合
  if (!cleanOld && !cleanNew) return '';
  if (!cleanOld && cleanNew) {
    // 新規追加されたダイアグラム
    if (mode === 'left') return ''; // 旧側には存在しない
    return appendThemeAndAllClasses(cleanNew, 'diffAdded', theme);
  }
  if (cleanOld && !cleanNew) {
    // 削除されたダイアグラム
    if (mode === 'right') return ''; // 新側には存在しない
    return appendThemeAndAllClasses(cleanOld, 'diffDeleted', theme);
  }

  // 両方存在する場合
  const isFlowchart =
    /^(flowchart|graph)\s+/i.test(cleanOld) ||
    /^(flowchart|graph)\s+/i.test(cleanNew);

  // フローチャート以外（シーケンス図など）の安全なフォールバック
  if (!isFlowchart) {
    if (mode === 'left') return cleanOld;
    if (mode === 'right') return cleanNew;
    // 統合モード: ひとまず新コードを描画（将来的により詳細な構文に対応）
    return cleanNew;
  }

  const oldNodeIds = extractAllNodeIds(cleanOld);
  const newNodeIds = extractAllNodeIds(cleanNew);

  // 差分ノードの特定
  const addedNodeIds = new Set<string>();
  for (const id of newNodeIds) {
    if (!oldNodeIds.has(id)) {
      addedNodeIds.add(id);
    }
  }

  const deletedNodeIds = new Set<string>();
  for (const id of oldNodeIds) {
    if (!newNodeIds.has(id)) {
      deletedNodeIds.add(id);
    }
  }

  // --- ビジュアル(分割)モード: 左ペイン（旧ファイル） ---
  if (mode === 'left') {
    let result = cleanOld;
    const deleteClassStatements: string[] = [];

    if (deletedNodeIds.size > 0) {
      deleteClassStatements.push(
        `    class ${Array.from(deletedNodeIds).join(',')} diffDeleted;`
      );
    }

    if (deleteClassStatements.length > 0) {
      const classDefs = getClassDefs(theme, ['diffDeleted']);
      result += '\n\n' + classDefs + '\n' + deleteClassStatements.join('\n');
    }
    return result;
  }

  // --- ビジュアル(分割)モード: 右ペイン（新ファイル） ---
  if (mode === 'right') {
    let result = cleanNew;
    const addClassStatements: string[] = [];

    if (addedNodeIds.size > 0) {
      addClassStatements.push(
        `    class ${Array.from(addedNodeIds).join(',')} diffAdded;`
      );
    }

    if (addClassStatements.length > 0) {
      const classDefs = getClassDefs(theme, ['diffAdded']);
      result += '\n\n' + classDefs + '\n' + addClassStatements.join('\n');
    }
    return result;
  }

  // --- ビジュアル(統合)モード: アプローチ①（全要素共存・合成Mermaid） ---
  const header = extractFlowchartHeader(cleanNew || cleanOld);

  const oldLines = cleanOld.split('\n');
  const newLines = cleanNew.split('\n');

  // 新コードの行セットを作成（重複除外用）
  const newNormalizedLines = new Set(
    newLines.map((l) => l.trim()).filter((l) => l.length > 0)
  );

  // 旧コードにのみ存在する行（＝削除された接続やノード定義）を抽出
  const deletedLines: string[] = [];
  for (const line of oldLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    if (/^(flowchart|graph)\s+/i.test(trimmed)) continue;
    if (trimmed.startsWith('classDef ') || trimmed.startsWith('class ')) continue;

    if (!newNormalizedLines.has(trimmed)) {
      deletedLines.push(line);
    }
  }

  // 合成Mermaidの組み立て
  const mergedLines: string[] = [];

  // ヘッダー
  mergedLines.push(header);

  // クラス定義（統合モードでは両方）
  const classDefs = getClassDefs(theme, ['diffAdded', 'diffDeleted', 'diffUnchanged']);
  mergedLines.push(classDefs);


  // 新コードの行（ヘッダー・classDef以外）
  for (const line of newLines) {
    const trimmed = line.trim();
    if (/^(flowchart|graph)\s+/i.test(trimmed)) continue;
    if (trimmed.startsWith('classDef ') || trimmed.startsWith('class ')) continue;
    mergedLines.push(line);
  }

  // 旧コードにのみ存在した削除行を追加（新旧同居）
  if (deletedLines.length > 0) {
    mergedLines.push('\n    %% 削除された要素（変更前のみに存在）');
    for (const dLine of deletedLines) {
      mergedLines.push(dLine);
    }
  }

  // クラス割り当てステートメント
  if (addedNodeIds.size > 0) {
    mergedLines.push(
      `    class ${Array.from(addedNodeIds).join(',')} diffAdded;`
    );
  }
  if (deletedNodeIds.size > 0) {
    mergedLines.push(
      `    class ${Array.from(deletedNodeIds).join(',')} diffDeleted;`
    );
  }

  // 差分凡例（Legend）サブグラフの付加
  if (addedNodeIds.size > 0 || deletedNodeIds.size > 0) {
    mergedLines.push('\n    subgraph diff_legend ["差分凡例"]');
    mergedLines.push('        direction LR');
    if (addedNodeIds.size > 0) {
      mergedLines.push('        leg_add["+ 追加"]:::diffAdded');
    }
    if (deletedNodeIds.size > 0) {
      mergedLines.push('        leg_del["- 削除"]:::diffDeleted');
    }
    mergedLines.push('    end');
  }

  return mergedLines.join('\n');
}

/**
 * 全ノードに対して指定のクラスを割り当てる（単独図の追加・削除用）
 */
function appendThemeAndAllClasses(
  code: string,
  className: 'diffAdded' | 'diffDeleted',
  theme: 'light' | 'dark'
): string {
  const nodeIds = extractAllNodeIds(code);
  if (nodeIds.size === 0) return code;

  const classDefs = getClassDefs(theme, [className]);
  const classStatement = `    class ${Array.from(nodeIds).join(',')} ${className};`;

  return code + '\n\n' + classDefs + '\n' + classStatement;
}

