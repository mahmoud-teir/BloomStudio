/**
 * Smart Parser Engine 🔥
 *
 * Converts raw Figma JSON into a clean semantic UI Tree.
 * Instead of just copying Figma types, it UNDERSTANDS the design:
 *
 *   Frame
 *    ├── Column
 *    │    ├── Text("Welcome")
 *    │    ├── Image(hero.png)
 *    │    └── Button("Get Started")
 *    └── Row
 *         ├── Icon(star)
 *         └── Text("4.9")
 */

import { FigmaNode } from './parser';
import { detectLayout, LayoutResult } from './layout-engine';
import { detectComponent, ComponentType } from './component-detector';

/* ──────────── Semantic Node Types ──────────── */

export type SemanticType =
  | 'Screen'
  | 'Column'
  | 'Row'
  | 'LazyColumn'
  | 'LazyRow'
  | 'Box'
  | 'Card'
  | 'Button'
  | 'Text'
  | 'Image'
  | 'Icon'
  | 'Input'
  | 'Divider'
  | 'Spacer'
  | 'TopBar'
  | 'BottomBar'
  | 'ListItem'
  | 'Component'
  | 'Avatar'
  | 'Chip'
  | 'Switch'
  | 'Checkbox'
  | 'FAB'
  | 'Badge'
  | 'ProgressBar'
  | 'TabBar'
  | 'Dropdown';

export interface UINode {
  id: string;
  name: string;
  semanticType: SemanticType;
  figmaType: string;
  aiReason: string;
  isReusable: boolean;
  reusableGroupId?: string;
  text?: string;
  children: UINode[];
  layoutConfidence?: number;
  layoutDetails?: string[];
  componentConfidence?: number;
  componentSignals?: string[];

  // Style data carried forward for codegen
  width?: number;
  height?: number;
  cornerRadius?: number;
  opacity?: number;
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  itemSpacing?: number;
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  style?: Record<string, any>;
}

/* ──────────── Component type to SemanticType mapping ──────────── */

const COMPONENT_TO_SEMANTIC: Record<NonNullable<ComponentType>, SemanticType> = {
  Button: 'Button',
  Card: 'Card',
  Input: 'Input',
  TopBar: 'TopBar',
  BottomBar: 'BottomBar',
  ListItem: 'ListItem',
  Avatar: 'Avatar',
  Chip: 'Chip',
  Switch: 'Switch',
  Checkbox: 'Checkbox',
  FAB: 'FAB',
  Badge: 'Badge',
  ProgressBar: 'ProgressBar',
  Slider: 'ProgressBar', // map slider → progress for now
  Dropdown: 'Dropdown',
  Dialog: 'Card',        // dialog renders like card
  TabBar: 'TabBar',
  Divider: 'Divider',
  Icon: 'Icon',
  Image: 'Image',
  Spacer: 'Spacer',
  Text: 'Text',
};

/** Leaf components don't recurse into children for codegen */
const LEAF_COMPONENTS: Set<SemanticType> = new Set([
  'Divider', 'Icon', 'Image', 'Spacer', 'Badge', 'Checkbox', 'Switch', 'ProgressBar',
]);

/** Container components recurse but are still detected as components */
const CONTAINER_COMPONENTS: Set<SemanticType> = new Set([
  'Button', 'Card', 'Input', 'TopBar', 'BottomBar', 'FAB', 'Chip', 'TabBar', 'Dropdown', 'Avatar', 'ListItem',
]);

/* ──────────── Repeated children → LazyColumn/LazyRow ──────────── */

function childrenStructuralHash(node: FigmaNode): string {
  let hash = node.type;
  if (node.layoutMode) hash += `|layout:${node.layoutMode}`;
  if (node.cornerRadius) hash += `|cr:${Math.round(node.cornerRadius)}`;
  const childCount = node.children?.length || 0;
  hash += `|cc:${childCount}`;
  if (node.children) {
    for (const child of node.children) {
      hash += `>(${childrenStructuralHash(child)})`;
    }
  }
  return hash;
}

function detectRepeatedChildren(node: FigmaNode): { isRepeated: boolean; minRepeat: number } {
  if (!node.children || node.children.length < 3) return { isRepeated: false, minRepeat: 0 };

  const hashes = node.children.map(c => childrenStructuralHash(c));
  const freq: Record<string, number> = {};
  for (const h of hashes) {
    freq[h] = (freq[h] || 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(freq));
  return { isRepeated: maxFreq >= 3, minRepeat: maxFreq };
}

/* ──────────── Reusable Component Detection ──────────── */

const structureRegistry = new Map<string, { count: number; ids: string[] }>();

function registerStructure(node: FigmaNode) {
  if (!node.children || node.children.length === 0) return;
  if (node.type === 'DOCUMENT' || node.type === 'CANVAS') return;

  const hash = childrenStructuralHash(node);
  const entry = structureRegistry.get(hash);
  if (entry) {
    entry.count++;
    entry.ids.push(node.id);
  } else {
    structureRegistry.set(hash, { count: 1, ids: [node.id] });
  }
  for (const child of node.children || []) {
    registerStructure(child);
  }
}

function isReusableCandidate(node: FigmaNode): { reusable: boolean; groupId?: string } {
  if (!node.children || node.children.length === 0) return { reusable: false };
  const hash = childrenStructuralHash(node);
  const entry = structureRegistry.get(hash);
  if (entry && entry.count >= 2 && node.children.length >= 2) {
    return { reusable: true, groupId: hash.substring(0, 12) };
  }
  return { reusable: false };
}

/* ──────────── Main Transform ──────────── */

export function buildUITree(figmaRoot: FigmaNode): UINode {
  // Phase 1: Register all structures to find reusable components
  structureRegistry.clear();
  registerStructure(figmaRoot);

  // Phase 2: Recursive transform
  return transformNode(figmaRoot);
}

function transformNode(node: FigmaNode): UINode {
  const base: UINode = {
    id: node.id,
    name: node.name,
    semanticType: 'Box',
    figmaType: node.type,
    aiReason: '',
    isReusable: false,
    children: [],
    width: node.absoluteBoundingBox?.width,
    height: node.absoluteBoundingBox?.height,
    cornerRadius: node.cornerRadius,
    opacity: node.opacity,
    fills: node.fills,
    strokes: node.strokes,
    strokeWeight: node.strokeWeight,
    paddingTop: node.paddingTop,
    paddingBottom: node.paddingBottom,
    paddingLeft: node.paddingLeft,
    paddingRight: node.paddingRight,
    itemSpacing: node.itemSpacing,
    layoutMode: node.layoutMode,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    style: node.style,
  };

  // ─── Text ───
  if (node.type === 'TEXT') {
    base.semanticType = 'Text';
    base.text = node.characters || '';
    base.aiReason = 'Figma TEXT node';
    return base;
  }

  // ═══════════════════════════════════════════════
  // 🧩 COMPONENT DETECTION ENGINE (runs 18 detectors)
  // ═══════════════════════════════════════════════

  const detection = detectComponent(node);

  if (detection.type) {
    const semantic = COMPONENT_TO_SEMANTIC[detection.type];
    base.semanticType = semantic;
    base.componentConfidence = detection.confidence;
    base.componentSignals = detection.signals;
    base.aiReason = `🧩 ${detection.reason} | signals: ${detection.signals.join(', ')}`;

    // Leaf components: no children needed
    if (LEAF_COMPONENTS.has(semantic)) {
      return base;
    }

    // Container components: recurse into children
    if (CONTAINER_COMPONENTS.has(semantic)) {
      base.children = (node.children || []).map(c => transformNode(c));

      // Check reusability
      const { reusable, groupId } = isReusableCandidate(node);
      if (reusable) {
        base.isReusable = true;
        base.reusableGroupId = groupId;
        base.aiReason += ' | ♻️ Reusable';
      }
      return base;
    }
  }

  // ─── Top-level containers ───

  if (node.type === 'DOCUMENT') {
    base.semanticType = 'Screen';
    base.aiReason = 'Document root';
    base.children = (node.children || []).map(c => transformNode(c));
    return base;
  }

  if (node.type === 'CANVAS') {
    base.semanticType = 'Screen';
    base.aiReason = 'Canvas page';
    base.children = (node.children || []).map(c => transformNode(c));
    return base;
  }

  // ═══════════════════════════════════════════════════════════
  // 🧠 REAL LAYOUT DETECTION ALGORITHM
  // ═══════════════════════════════════════════════════════════

  // First: transform children
  base.children = (node.children || []).map(c => transformNode(c));

  // Check for repeated children → LazyColumn / LazyRow
  const { isRepeated, minRepeat } = detectRepeatedChildren(node);

  // If Figma provides Auto Layout, trust it (highest confidence)
  if (node.layoutMode === 'VERTICAL') {
    if (isRepeated) {
      base.semanticType = 'LazyColumn';
      base.aiReason = `Auto-Layout VERTICAL + ${minRepeat} repeated children → scrollable list`;
      base.layoutConfidence = 1.0;
    } else {
      base.semanticType = 'Column';
      base.aiReason = 'Figma Auto-Layout VERTICAL';
      base.layoutConfidence = 1.0;
    }
  } else if (node.layoutMode === 'HORIZONTAL') {
    if (isRepeated) {
      base.semanticType = 'LazyRow';
      base.aiReason = `Auto-Layout HORIZONTAL + ${minRepeat} repeated children → horizontal scrollable list`;
      base.layoutConfidence = 1.0;
    } else {
      base.semanticType = 'Row';
      base.aiReason = 'Figma Auto-Layout HORIZONTAL';
      base.layoutConfidence = 1.0;
    }
  } else {
    // ┌──────────────────────────────────────────────────────────────┐
    // │  NO AUTO LAYOUT → Run the real geometric layout algorithm   │
    // └──────────────────────────────────────────────────────────────┘
    const childBoxes = (node.children || [])
      .filter(c => c.absoluteBoundingBox)
      .map(c => c.absoluteBoundingBox!);

    if (childBoxes.length >= 2) {
      const result: LayoutResult = detectLayout(childBoxes);
      base.layoutConfidence = result.confidence;
      base.layoutDetails = result.details;

      switch (result.type) {
        case 'column':
          base.semanticType = isRepeated ? 'LazyColumn' : 'Column';
          base.itemSpacing = result.spacing || base.itemSpacing;
          base.aiReason = isRepeated
            ? `🧠 Layout Engine: Column (${(result.confidence * 100).toFixed(0)}% confidence) + ${minRepeat} repeated → LazyColumn | ${result.reason}`
            : `🧠 Layout Engine: Column (${(result.confidence * 100).toFixed(0)}% confidence) | ${result.reason}`;
          break;

        case 'row':
          base.semanticType = isRepeated ? 'LazyRow' : 'Row';
          base.itemSpacing = result.spacing || base.itemSpacing;
          base.aiReason = isRepeated
            ? `🧠 Layout Engine: Row (${(result.confidence * 100).toFixed(0)}% confidence) + ${minRepeat} repeated → LazyRow | ${result.reason}`
            : `🧠 Layout Engine: Row (${(result.confidence * 100).toFixed(0)}% confidence) | ${result.reason}`;
          break;

        case 'grid':
          // For grid, we use Column with Row children (or LazyVerticalGrid concept)
          base.semanticType = 'Column';
          base.aiReason = `🧠 Layout Engine: Grid ${result.gridRows}×${result.gridColumns} (${(result.confidence * 100).toFixed(0)}%) — mapped to Column of Rows | ${result.reason}`;
          break;

        case 'wrap-row':
          base.semanticType = 'Column'; // FlowRow wraps into vertical space
          base.aiReason = `🧠 Layout Engine: FlowRow/Wrap (${(result.confidence * 100).toFixed(0)}%) — horizontal wrap → Column of Rows | ${result.reason}`;
          break;

        case 'wrap-column':
          base.semanticType = 'Row'; // FlowColumn wraps into horizontal space
          base.aiReason = `🧠 Layout Engine: FlowColumn/Wrap (${(result.confidence * 100).toFixed(0)}%) — vertical wrap → Row of Columns | ${result.reason}`;
          break;

        case 'stack':
          base.semanticType = 'Box';
          base.aiReason = `🧠 Layout Engine: Stack/Box (${(result.confidence * 100).toFixed(0)}%) — overlapping elements | ${result.reason}`;
          break;

        case 'absolute':
          base.semanticType = 'Box';
          base.aiReason = `🧠 Layout Engine: Absolute/Free (${(result.confidence * 100).toFixed(0)}%) — no clear pattern | ${result.reason}`;
          break;
      }
    } else if (node.children && node.children.length > 0) {
      // Single child → Column by default
      base.semanticType = 'Column';
      base.aiReason = 'Single child → Column wrapper';
      base.layoutConfidence = 0.9;
    }
  }

  // Check reusability for this node
  const { reusable, groupId } = isReusableCandidate(node);
  if (reusable) {
    base.isReusable = true;
    base.reusableGroupId = groupId;
    base.semanticType = 'Component';
    base.aiReason += ' | ♻️ Reusable: identical structure appears ≥2 times in document';
  }

  // Screen-level frame
  if ((node.type === 'FRAME' || node.type === 'COMPONENT') && !node.absoluteBoundingBox) {
    base.semanticType = 'Screen';
    base.aiReason = 'Top-level frame → Screen';
  }

  return base;
}

/* ──────────── Tree Printing (for sidebar) ──────────── */

export function printUITree(node: UINode, indent: string = ''): string {
  const icon = semanticIcon(node.semanticType);
  const reusableTag = node.isReusable ? ' ♻️' : '';
  let line = `${indent}${icon} ${node.semanticType}`;
  
  if (node.text) {
    const preview = node.text.length > 30 ? node.text.substring(0, 30) + '…' : node.text;
    line += `("${preview}")`;
  } else if (node.name && node.name !== node.semanticType) {
    line += ` [${node.name}]`;
  }
  line += reusableTag;
  line += '\n';

  for (const child of node.children) {
    const isLast = child === node.children[node.children.length - 1];
    const connector = isLast ? '└── ' : '├── ';
    const childIndent = indent + (isLast ? '    ' : '│   ');
    line += `${indent}${connector}`;
    // Remove the initial indent from child since we add connector
    const childStr = printUITree(child, childIndent);
    // Take everything after the first indent
    line += childStr.trimStart();
  }

  return line;
}

function semanticIcon(type: SemanticType): string {
  const icons: Record<SemanticType, string> = {
    Screen: '📱', Column: '⬇️', Row: '➡️', LazyColumn: '📜', LazyRow: '🔄',
    Box: '📦', Card: '🃏', Button: '🔘', Text: '📝', Image: '🖼️',
    Icon: '⭐', Input: '✏️', Divider: '➖', Spacer: '⬜', TopBar: '🔝',
    BottomBar: '⬇️', ListItem: '📋', Component: '♻️',
    Avatar: '👤', Chip: '🏷️', Switch: '🎚️', Checkbox: '☑️', FAB: '➕',
    Badge: '🔴', ProgressBar: '⏳', TabBar: '📑', Dropdown: '🔽'
  };
  return icons[type] || '📦';
}

/* ──────────── Stats ──────────── */

export function getTreeStats(node: UINode): {
  totalNodes: number;
  reusableCount: number;
  lazyListCount: number;
  typeBreakdown: Record<string, number>;
} {
  const stats = {
    totalNodes: 0,
    reusableCount: 0,
    lazyListCount: 0,
    typeBreakdown: {} as Record<string, number>,
  };

  function walk(n: UINode) {
    stats.totalNodes++;
    stats.typeBreakdown[n.semanticType] = (stats.typeBreakdown[n.semanticType] || 0) + 1;
    if (n.isReusable) stats.reusableCount++;
    if (n.semanticType === 'LazyColumn' || n.semanticType === 'LazyRow') stats.lazyListCount++;
    for (const child of n.children) walk(child);
  }

  walk(node);
  return stats;
}
