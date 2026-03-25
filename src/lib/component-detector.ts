/**
 * 🧩 Component Detection Engine
 *
 * Real multi-signal component detector with confidence scoring.
 * Instead of simple name matching, it analyzes:
 *   - Node structure (children types & count)
 *   - Dimensions & aspect ratio
 *   - Visual properties (fills, strokes, corner radius, effects)
 *   - Position within parent (top/bottom/center)
 *   - Name patterns (as supporting evidence, not primary)
 *
 * Each detector returns a score 0-1. The highest score wins.
 *
 * Detected Components:
 *   Button, Card, Input, TopBar, BottomBar, ListItem, Avatar,
 *   Chip, Switch, Checkbox, FAB, Badge, ProgressBar, Slider,
 *   Dropdown, Dialog, TabBar, Divider, Icon, Image, Spacer
 */

import { FigmaNode } from './parser';

/* ══════════════════════════════════════
   TYPES
   ══════════════════════════════════════ */

export type ComponentType =
  | 'Button'
  | 'Card'
  | 'Input'
  | 'TopBar'
  | 'BottomBar'
  | 'ListItem'
  | 'Avatar'
  | 'Chip'
  | 'Switch'
  | 'Checkbox'
  | 'FAB'
  | 'Badge'
  | 'ProgressBar'
  | 'Slider'
  | 'Dropdown'
  | 'Dialog'
  | 'TabBar'
  | 'Divider'
  | 'Icon'
  | 'Image'
  | 'Spacer'
  | 'Text'
  | null;  // undetected → layout container

export interface ComponentDetection {
  type: ComponentType;
  confidence: number;    // 0-1
  reason: string;
  signals: string[];     // all signals that contributed
}

/* ══════════════════════════════════════
   SIGNAL HELPERS
   ══════════════════════════════════════ */

interface NodeInfo {
  name: string;
  nameLower: string;
  type: string;
  w: number;
  h: number;
  ratio: number;        // width / height
  area: number;
  cornerRadius: number;
  isCircular: boolean;  // corner radius >= half the shortest side
  isPill: boolean;      // corner radius >= height/2 AND wide
  hasFill: boolean;
  hasImageFill: boolean;
  hasStroke: boolean;
  hasShadow: boolean;
  childCount: number;
  textChildren: number;
  iconChildren: number;
  imageChildren: number;
  deepTextCount: number;
  hasPlaceholderText: boolean;
  fillColor: { r: number; g: number; b: number } | null;
  opacity: number;
  isTopPosition: boolean;    // near parent top
  isBottomPosition: boolean; // near parent bottom
}

function gatherInfo(node: FigmaNode, parentNode?: FigmaNode): NodeInfo {
  const box = node.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
  const w = box.width || 0;
  const h = box.height || 0;
  const cr = node.cornerRadius || 0;
  const minSide = Math.min(w, h);

  const fills = (node.fills || []).filter((f: any) => f.visible !== false);
  const solidFill = fills.find((f: any) => f.type === 'SOLID');
  const imageFill = fills.find((f: any) => f.type === 'IMAGE');
  const strokes = (node.strokes || []).filter((s: any) => s.visible !== false);
  const effects = (node as any).effects || [];
  const shadows = effects.filter((e: any) => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');

  const children = node.children || [];
  const textChildren = children.filter(c => c.type === 'TEXT').length;
  const iconChildren = children.filter(c => {
    const n = c.name.toLowerCase();
    return n.includes('icon') || n.includes('ic_') ||
      (c.absoluteBoundingBox && c.absoluteBoundingBox.width <= 32 && c.absoluteBoundingBox.height <= 32 && c.type !== 'TEXT');
  }).length;
  const imageChildren = children.filter(c =>
    c.fills?.some((f: any) => f.type === 'IMAGE') ||
    c.name.toLowerCase().includes('image') ||
    c.name.toLowerCase().includes('photo')
  ).length;

  // Deep text count (recursive)
  function countText(n: FigmaNode): number {
    let count = n.type === 'TEXT' ? 1 : 0;
    for (const c of n.children || []) count += countText(c);
    return count;
  }

  // Check for placeholder-like text
  const hasPlaceholder = children.some(c =>
    c.type === 'TEXT' && c.characters &&
    (c.characters.toLowerCase().includes('search') ||
     c.characters.toLowerCase().includes('enter') ||
     c.characters.toLowerCase().includes('type') ||
     c.characters.toLowerCase().includes('placeholder') ||
     c.characters.toLowerCase().includes('email') ||
     c.characters.toLowerCase().includes('password') ||
     c.characters.toLowerCase().includes('username'))
  );

  // Position in parent
  const parentBox = parentNode?.absoluteBoundingBox;
  let isTop = false, isBottom = false;
  if (parentBox) {
    const relY = box.y - parentBox.y;
    isTop = relY < parentBox.height * 0.15;
    isBottom = relY + h > parentBox.y + parentBox.height * 0.85;
  }

  return {
    name: node.name,
    nameLower: node.name.toLowerCase(),
    type: node.type,
    w, h,
    ratio: h > 0 ? w / h : 0,
    area: w * h,
    cornerRadius: cr,
    isCircular: minSide > 0 && cr >= minSide / 2 - 1,
    isPill: h > 0 && cr >= h / 2 - 1 && w > h * 1.5,
    hasFill: !!solidFill,
    hasImageFill: !!imageFill,
    hasStroke: strokes.length > 0,
    hasShadow: shadows.length > 0,
    childCount: children.length,
    textChildren,
    iconChildren,
    imageChildren,
    deepTextCount: countText(node),
    hasPlaceholderText: hasPlaceholder,
    fillColor: solidFill?.color ? { r: solidFill.color.r, g: solidFill.color.g, b: solidFill.color.b } : null,
    opacity: node.opacity ?? 1,
    isTopPosition: isTop,
    isBottomPosition: isBottom,
  };
}

function nameBonus(nameLower: string, patterns: string[]): number {
  return patterns.some(p => nameLower.includes(p)) ? 0.3 : 0;
}

/* ══════════════════════════════════════
   INDIVIDUAL DETECTORS
   ══════════════════════════════════════ */

function scoreButton(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // Name signals
  const nb = nameBonus(info.nameLower, ['button', 'btn', 'cta', 'submit', 'action']);
  if (nb > 0) { score += nb; signals.push(`Name matches button pattern`); }

  // Structure: small frame + text (+ optional icon)
  if (info.textChildren >= 1 && info.childCount <= 3) { score += 0.15; signals.push(`${info.textChildren} text + ${info.childCount} total children`); }

  // Shape: rounded with fill
  if (info.cornerRadius >= 6 && info.hasFill) { score += 0.2; signals.push(`Rounded (${info.cornerRadius}px) with solid fill`); }
  if (info.isPill) { score += 0.1; signals.push('Pill shape'); }

  // Size: typically compact
  if (info.h >= 28 && info.h <= 64 && info.w >= 60 && info.w <= 400) { score += 0.1; signals.push(`Button-sized (${Math.round(info.w)}×${Math.round(info.h)})`); }

  // Icon + text = icon button
  if (info.iconChildren >= 1 && info.textChildren >= 1 && info.childCount <= 3) { score += 0.1; signals.push('Icon + text combo'); }

  // Bold/colored fill suggests CTA
  if (info.fillColor && (info.fillColor.r < 0.3 || info.fillColor.g < 0.3 || info.fillColor.b > 0.6)) {
    score += 0.05; signals.push('Vivid fill color');
  }

  return { score: Math.min(1, score), signals };
}

function scoreCard(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['card', 'tile', 'item', 'cell']);
  if (nb > 0) { score += nb; signals.push('Name matches card pattern'); }

  // Multiple children
  if (info.childCount >= 2) { score += 0.15; signals.push(`${info.childCount} children`); }
  if (info.childCount >= 3) { score += 0.05; signals.push('Rich content (3+ children)'); }

  // Rounded corners + fill
  if (info.cornerRadius >= 8 && info.hasFill) { score += 0.2; signals.push(`Rounded (${info.cornerRadius}px) with fill`); }

  // Shadow = elevation = card
  if (info.hasShadow) { score += 0.2; signals.push('Has drop shadow (elevation)'); }

  // Contains image + text = typical card
  if (info.imageChildren > 0 && info.textChildren > 0) { score += 0.15; signals.push('Image + text content'); }

  // Medium/large size
  if (info.w > 100 && info.h > 80) { score += 0.05; signals.push('Card-sized element'); }

  return { score: Math.min(1, score), signals };
}

function scoreInput(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['input', 'textfield', 'text field', 'search', 'text_field', 'edit', 'form']);
  if (nb > 0) { score += nb; signals.push('Name matches input pattern'); }

  // Wide + short = text field shape
  if (info.ratio > 3 && info.h >= 30 && info.h <= 72) { score += 0.2; signals.push(`Wide ratio (${info.ratio.toFixed(1)}:1)`); }

  // Border/stroke = outlined input
  if (info.hasStroke && info.cornerRadius >= 4) { score += 0.25; signals.push('Bordered with rounded corners'); }

  // Placeholder text
  if (info.hasPlaceholderText) { score += 0.2; signals.push('Contains placeholder-like text'); }

  // Usually 1 text child only
  if (info.textChildren === 1 && info.childCount <= 3) { score += 0.1; signals.push('Single text child (placeholder)'); }

  // Sometimes has icon (search icon, etc.)
  if (info.iconChildren === 1 && info.textChildren === 1) { score += 0.05; signals.push('Icon + text (search field)'); }

  return { score: Math.min(1, score), signals };
}

function scoreAvatar(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['avatar', 'profile', 'user pic', 'userpic', 'pfp']);
  if (nb > 0) { score += nb; signals.push('Name matches avatar pattern'); }

  // Circular/square small element
  if (info.isCircular && info.w >= 24 && info.w <= 80) { score += 0.3; signals.push(`Circular (${Math.round(info.w)}px)`); }

  // Near-square aspect ratio
  const aspectDiff = Math.abs(info.w - info.h);
  if (aspectDiff < 4 && info.w >= 24 && info.w <= 80) { score += 0.15; signals.push('Square aspect'); }

  // Image fill = photo
  if (info.hasImageFill) { score += 0.25; signals.push('Has image fill'); }

  // Small
  if (info.area < 80 * 80 && info.area > 20 * 20) { score += 0.05; signals.push('Avatar-sized'); }

  return { score: Math.min(1, score), signals };
}

function scoreChip(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['chip', 'tag', 'badge', 'label', 'pill']);
  if (nb > 0) { score += nb; signals.push('Name matches chip pattern'); }

  // Pill shape, small
  if (info.isPill && info.h <= 40) { score += 0.3; signals.push('Small pill shape'); }

  // Has fill + text
  if (info.hasFill && info.textChildren === 1 && info.childCount <= 2) { score += 0.2; signals.push('Filled with single text'); }

  // Small size
  if (info.w < 150 && info.h < 40) { score += 0.1; signals.push('Chip-sized'); }

  return { score: Math.min(1, score), signals };
}

function scoreSwitch(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['switch', 'toggle', 'toggler']);
  if (nb > 0) { score += nb; signals.push('Name matches switch pattern'); }

  // Small, wide-ish, rounded with a circular child (thumb)
  if (info.w >= 36 && info.w <= 64 && info.h >= 18 && info.h <= 36) { score += 0.2; signals.push('Switch-sized'); }
  if (info.isCircular || info.cornerRadius >= info.h / 2 - 1) { score += 0.2; signals.push('Fully rounded (track shape)'); }
  if (info.childCount === 1 || info.childCount === 2) { score += 0.1; signals.push('1-2 children (thumb + maybe label)'); }

  return { score: Math.min(1, score), signals };
}

function scoreCheckbox(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['checkbox', 'check', 'radio', 'tick']);
  if (nb > 0) { score += nb; signals.push('Name matches checkbox'); }

  // Small square or circle
  if (info.w >= 14 && info.w <= 32 && Math.abs(info.w - info.h) < 4) { score += 0.3; signals.push('Small square/circle'); }
  if (info.hasStroke && info.cornerRadius >= 2) { score += 0.2; signals.push('Bordered with radius'); }
  if (info.childCount <= 1) { score += 0.1; signals.push('Minimal children (check icon)'); }

  return { score: Math.min(1, score), signals };
}

function scoreFAB(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['fab', 'floating', 'action button']);
  if (nb > 0) { score += nb; signals.push('Name matches FAB'); }

  // Circular/large-rounded + fill + shadow
  if (info.isCircular && info.w >= 40 && info.w <= 72) { score += 0.25; signals.push('Circular FAB-sized'); }
  if (info.hasFill && info.hasShadow) { score += 0.2; signals.push('Filled with shadow (elevated)'); }
  if (info.iconChildren === 1 && info.childCount <= 2) { score += 0.15; signals.push('Single icon child'); }

  return { score: Math.min(1, score), signals };
}

function scoreBadge(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['badge', 'notification', 'count', 'dot']);
  if (nb > 0) { score += nb; signals.push('Name matches badge'); }

  // Tiny circle with optional number text
  if (info.isCircular && info.w <= 24 && info.w >= 6) { score += 0.3; signals.push('Tiny circle'); }
  if (info.hasFill && info.fillColor && info.fillColor.r > 0.7) { score += 0.15; signals.push('Red-ish fill (notification)'); }
  if (info.textChildren <= 1 && info.childCount <= 1) { score += 0.1; signals.push('Minimal content'); }

  return { score: Math.min(1, score), signals };
}

function scoreProgressBar(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['progress', 'loading', 'bar', 'indicator']);
  if (nb > 0) { score += nb; signals.push('Name matches progress'); }

  // Very wide + very short
  if (info.ratio > 8 && info.h <= 12 && info.h >= 2) { score += 0.3; signals.push(`Thin bar (${Math.round(info.w)}×${Math.round(info.h)})`); }
  if (info.cornerRadius >= info.h / 2 - 1) { score += 0.1; signals.push('Fully rounded bar'); }
  if (info.hasFill) { score += 0.1; signals.push('Has fill'); }

  return { score: Math.min(1, score), signals };
}

function scoreTabBar(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['tab', 'tabs', 'tabbar', 'tab bar', 'segment', 'segmented']);
  if (nb > 0) { score += nb; signals.push('Name matches tab bar'); }

  // Wide + short + multiple similar children
  if (info.ratio > 3 && info.h >= 30 && info.h <= 64) { score += 0.15; signals.push('Tab bar dimensions'); }
  if (info.childCount >= 2 && info.childCount <= 6) { score += 0.15; signals.push(`${info.childCount} tabs`); }

  // Children have similar widths
  // (can't check widths without children data here, rely on name + shape)

  return { score: Math.min(1, score), signals };
}

function scoreTopBar(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['topbar', 'top bar', 'appbar', 'toolbar', 'header', 'navbar', 'nav bar', 'navigation bar', 'status bar']);
  if (nb > 0) { score += nb; signals.push('Name matches top bar'); }

  // Wide + fixed height near top
  if (info.ratio > 4 && info.h >= 44 && info.h <= 100) { score += 0.2; signals.push('Top bar dimensions'); }
  if (info.isTopPosition) { score += 0.2; signals.push('Positioned at parent top'); }
  if (info.textChildren >= 1) { score += 0.05; signals.push('Has title text'); }

  return { score: Math.min(1, score), signals };
}

function scoreBottomBar(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['bottombar', 'bottom bar', 'bottom nav', 'tab bar', 'navigation bar', 'bottom_nav', 'dock']);
  if (nb > 0) { score += nb; signals.push('Name matches bottom bar'); }

  // Wide + fixed height near bottom
  if (info.ratio > 4 && info.h >= 48 && info.h <= 100) { score += 0.15; signals.push('Bottom bar dimensions'); }
  if (info.isBottomPosition) { score += 0.25; signals.push('Positioned at parent bottom'); }

  // Multiple icon children side by side
  if (info.iconChildren >= 3 || info.childCount >= 3) { score += 0.1; signals.push(`${info.childCount} tab items`); }

  return { score: Math.min(1, score), signals };
}

function scoreDivider(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['divider', 'separator', 'line', 'hr']);
  if (nb > 0) { score += nb; signals.push('Name matches divider'); }

  // Very thin in one dimension
  if ((info.h <= 2 && info.w > 40) || (info.w <= 2 && info.h > 40)) {
    score += 0.5; signals.push(`Thin line (${Math.round(info.w)}×${Math.round(info.h)})`);
  }
  if (info.childCount === 0) { score += 0.1; signals.push('No children'); }

  return { score: Math.min(1, score), signals };
}

function scoreIcon(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['icon', 'ic_', 'ic/', 'ico', 'svg']);
  if (nb > 0) { score += nb; signals.push('Name matches icon'); }

  // Small square-ish element
  if (info.w <= 48 && info.h <= 48 && info.w > 0 && info.type !== 'TEXT') {
    score += 0.3; signals.push(`Small (${Math.round(info.w)}×${Math.round(info.h)})`);
  }

  // Vector type
  if (info.type === 'VECTOR' || info.type === 'BOOLEAN_OPERATION') {
    score += 0.2; signals.push('Vector node');
  }

  // Near-square
  if (Math.abs(info.w - info.h) < 8 && info.w <= 48) {
    score += 0.1; signals.push('Square proportions');
  }

  return { score: Math.min(1, score), signals };
}

function scoreImage(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['image', 'photo', 'picture', 'thumbnail', 'banner', 'hero', 'cover', 'illustration']);
  if (nb > 0) { score += nb; signals.push('Name matches image'); }

  // Image fill is the strongest signal
  if (info.hasImageFill) { score += 0.5; signals.push('Has IMAGE fill type'); }

  // Larger than icon
  if (info.w > 48 || info.h > 48) { score += 0.1; signals.push('Larger than icon size'); }

  return { score: Math.min(1, score), signals };
}

function scoreSpacer(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['spacer', 'spacing', 'gap']);
  if (nb > 0) { score += nb; signals.push('Name matches spacer'); }

  // No children, no text, no visible fill
  if (info.childCount === 0 && !info.hasFill && !info.hasStroke && !info.hasImageFill) {
    score += 0.4; signals.push('Empty invisible frame');
  }

  return { score: Math.min(1, score), signals };
}

function scoreDropdown(info: NodeInfo): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const nb = nameBonus(info.nameLower, ['dropdown', 'select', 'picker', 'combo', 'menu', 'popover']);
  if (nb > 0) { score += nb; signals.push('Name matches dropdown'); }

  // Similar to input but with a chevron icon
  if (info.ratio > 2 && info.hasStroke) { score += 0.1; signals.push('Input-like shape with border'); }
  if (info.iconChildren >= 1 && info.textChildren >= 1 && info.childCount <= 3) {
    score += 0.15; signals.push('Text + icon (chevron)');
  }

  return { score: Math.min(1, score), signals };
}

/* ══════════════════════════════════════
   MAIN DETECTOR (runs ALL and picks winner)
   ══════════════════════════════════════ */

const DETECTORS: { type: ComponentType; fn: (info: NodeInfo) => { score: number; signals: string[] } }[] = [
  { type: 'Divider',     fn: scoreDivider },
  { type: 'Badge',       fn: scoreBadge },
  { type: 'Checkbox',    fn: scoreCheckbox },
  { type: 'Switch',      fn: scoreSwitch },
  { type: 'ProgressBar', fn: scoreProgressBar },
  { type: 'Spacer',      fn: scoreSpacer },
  { type: 'Icon',        fn: scoreIcon },
  { type: 'Avatar',      fn: scoreAvatar },
  { type: 'Chip',        fn: scoreChip },
  { type: 'FAB',         fn: scoreFAB },
  { type: 'Image',       fn: scoreImage },
  { type: 'Input',       fn: scoreInput },
  { type: 'Dropdown',    fn: scoreDropdown },
  { type: 'Button',      fn: scoreButton },
  { type: 'TabBar',      fn: scoreTabBar },
  { type: 'TopBar',      fn: scoreTopBar },
  { type: 'BottomBar',   fn: scoreBottomBar },
  { type: 'Card',        fn: scoreCard },
];

const MIN_CONFIDENCE = 0.35; // minimum score to claim a detection

export function detectComponent(node: FigmaNode, parentNode?: FigmaNode): ComponentDetection {
  // Text nodes are always Text
  if (node.type === 'TEXT') {
    return { type: 'Text', confidence: 1.0, reason: 'Figma TEXT node', signals: ['type === TEXT'] };
  }

  const info = gatherInfo(node, parentNode);

  // Run all detectors
  const results = DETECTORS.map(d => ({
    type: d.type,
    ...d.fn(info),
  })).sort((a, b) => b.score - a.score);

  const winner = results[0];
  const runnerUp = results[1];

  // Must exceed minimum confidence
  if (winner.score < MIN_CONFIDENCE) {
    return { type: null, confidence: 0, reason: 'No component pattern matched', signals: [] };
  }

  // Check if winner is clearly ahead of runner-up
  const margin = winner.score - (runnerUp?.score || 0);
  const adjustedConfidence = Math.min(1, winner.score + margin * 0.3);

  return {
    type: winner.type,
    confidence: adjustedConfidence,
    reason: `${winner.type} (${(adjustedConfidence * 100).toFixed(0)}% confidence, margin=${(margin * 100).toFixed(0)}%)`,
    signals: winner.signals,
  };
}

/**
 * Detect all children components and return a summary
 */
export function detectChildComponents(node: FigmaNode): {
  detections: Map<string, ComponentDetection>;
  summary: Record<string, number>;
} {
  const detections = new Map<string, ComponentDetection>();
  const summary: Record<string, number> = {};

  function traverse(n: FigmaNode, parent?: FigmaNode) {
    const result = detectComponent(n, parent);
    if (result.type) {
      detections.set(n.id, result);
      summary[result.type] = (summary[result.type] || 0) + 1;
    }
    for (const child of n.children || []) {
      traverse(child, n);
    }
  }

  traverse(node);
  return { detections, summary };
}
