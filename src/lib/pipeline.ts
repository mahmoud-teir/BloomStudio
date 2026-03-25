/**
 * Professional Pipeline 🔥
 *
 * Figma JSON → Cleaner → Normalizer → Layout Detector → Component Detector → Clean UINode
 *
 * This pipeline processes raw Figma nodes BEFORE the smart parser,
 * fixing common designer mistakes and normalizing values for accurate codegen.
 */

import { FigmaNode } from './parser';

/* ═══════════════════════════════════════════
   STEP 1: CLEANER — Remove garbage nodes
   ═══════════════════════════════════════════ */

export function cleanTree(node: FigmaNode): FigmaNode | null {
  // Remove invisible nodes
  if (node.visible === false) return null;

  // Remove zero-size nodes (except text which can have 0 computed size)
  if (node.type !== 'TEXT' && node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    if (width <= 0 || height <= 0) return null;
  }

  // Remove completely empty groups with no visual
  if (node.type === 'GROUP' && (!node.children || node.children.length === 0)) return null;

  // Remove mask layers (they're applied, not rendered)
  if ((node as any).isMask) return null;

  // Recursively clean children
  const cleanedChildren = (node.children || [])
    .map(c => cleanTree(c))
    .filter((c): c is FigmaNode => c !== null);

  return { ...node, children: cleanedChildren };
}

/* ═══════════════════════════════════════════
   STEP 2: NORMALIZER — Unify values
   ═══════════════════════════════════════════ */

export function normalizeTree(node: FigmaNode): FigmaNode {
  const normalized = { ...node };

  // Normalize name: trim whitespace, collapse spaces
  if (normalized.name) {
    normalized.name = normalized.name.trim().replace(/\s+/g, ' ');
  }

  // Normalize fills: remove invisible fills
  if (normalized.fills) {
    normalized.fills = normalized.fills.filter(f => f.visible !== false);
  }

  // Normalize strokes: remove invisible strokes
  if (normalized.strokes) {
    normalized.strokes = normalized.strokes.filter(s => s.visible !== false);
  }

  // Normalize corner radius: clamp negatives
  if (normalized.cornerRadius !== undefined && normalized.cornerRadius < 0) {
    normalized.cornerRadius = 0;
  }

  // Normalize opacity: clamp between 0-1
  if (normalized.opacity !== undefined) {
    normalized.opacity = Math.max(0, Math.min(1, normalized.opacity));
  }

  // Normalize padding: default 0 if undefined
  normalized.paddingTop = normalized.paddingTop || 0;
  normalized.paddingBottom = normalized.paddingBottom || 0;
  normalized.paddingLeft = normalized.paddingLeft || 0;
  normalized.paddingRight = normalized.paddingRight || 0;

  // Normalize font weight: round to nearest 100
  if (normalized.style?.fontWeight) {
    normalized.style = {
      ...normalized.style,
      fontWeight: Math.round(normalized.style.fontWeight / 100) * 100,
    };
  }

  // Recursively normalize children
  normalized.children = (normalized.children || []).map(c => normalizeTree(c));

  return normalized;
}

/* ═══════════════════════════════════════════
   STEP 3: LAYOUT DETECTOR (Position-based)
   ═══════════════════════════════════════════ */

export interface LayoutAnalysis {
  direction: 'vertical' | 'horizontal' | 'overlap' | 'single';
  confidence: number; // 0-1
  spacing: number;
  reason: string;
}

export function analyzeLayout(node: FigmaNode): LayoutAnalysis {
  // If Figma provides auto-layout, use it (high confidence)
  if (node.layoutMode === 'VERTICAL') {
    return { direction: 'vertical', confidence: 1.0, spacing: node.itemSpacing || 0, reason: 'Figma Auto-Layout VERTICAL' };
  }
  if (node.layoutMode === 'HORIZONTAL') {
    return { direction: 'horizontal', confidence: 1.0, spacing: node.itemSpacing || 0, reason: 'Figma Auto-Layout HORIZONTAL' };
  }

  const children = node.children?.filter(c => c.absoluteBoundingBox) || [];
  if (children.length <= 1) {
    return { direction: 'single', confidence: 1.0, spacing: 0, reason: 'Single or no children' };
  }

  // Sort by position
  const boxes = children.map(c => ({
    x: c.absoluteBoundingBox!.x,
    y: c.absoluteBoundingBox!.y,
    w: c.absoluteBoundingBox!.width,
    h: c.absoluteBoundingBox!.height,
  }));

  // Check VERTICAL: same X band, increasing Y
  const xCenter = boxes.map(b => b.x + b.w / 2);
  const xSpread = Math.max(...xCenter) - Math.min(...xCenter);
  const parentWidth = node.absoluteBoundingBox?.width || 1;
  const xAlignment = xSpread / parentWidth; // 0 = perfect alignment

  // Check HORIZONTAL: same Y band, increasing X
  const yCenter = boxes.map(b => b.y + b.h / 2);
  const ySpread = Math.max(...yCenter) - Math.min(...yCenter);
  const parentHeight = node.absoluteBoundingBox?.height || 1;
  const yAlignment = ySpread / parentHeight;

  // Check for overlaps
  let overlapCount = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        overlapCount++;
      }
    }
  }

  if (overlapCount > boxes.length * 0.3) {
    return { direction: 'overlap', confidence: 0.7, spacing: 0, reason: `${overlapCount} overlapping elements → Box/Stack` };
  }

  // Calculate spacings
  const sortedByY = [...boxes].sort((a, b) => a.y - b.y);
  const ySpacings = sortedByY.slice(1).map((b, i) => b.y - (sortedByY[i].y + sortedByY[i].h));
  const avgYSpacing = ySpacings.length > 0 ? ySpacings.reduce((a, b) => a + b, 0) / ySpacings.length : 0;

  const sortedByX = [...boxes].sort((a, b) => a.x - b.x);
  const xSpacings = sortedByX.slice(1).map((b, i) => b.x - (sortedByX[i].x + sortedByX[i].w));
  const avgXSpacing = xSpacings.length > 0 ? xSpacings.reduce((a, b) => a + b, 0) / xSpacings.length : 0;

  // Decision
  if (xAlignment < 0.15 && yAlignment > 0.1) {
    return {
      direction: 'vertical',
      confidence: Math.min(0.95, 1 - xAlignment),
      spacing: Math.max(0, Math.round(avgYSpacing)),
      reason: `Elements aligned vertically (X spread: ${(xAlignment * 100).toFixed(0)}%, avg Y spacing: ${Math.round(avgYSpacing)}px)`
    };
  }

  if (yAlignment < 0.15 && xAlignment > 0.1) {
    return {
      direction: 'horizontal',
      confidence: Math.min(0.95, 1 - yAlignment),
      spacing: Math.max(0, Math.round(avgXSpacing)),
      reason: `Elements aligned horizontally (Y spread: ${(yAlignment * 100).toFixed(0)}%, avg X spacing: ${Math.round(avgXSpacing)}px)`
    };
  }

  // Check total spread
  const totalYSpread = Math.max(...boxes.map(b => b.y + b.h)) - Math.min(...boxes.map(b => b.y));
  const totalXSpread = Math.max(...boxes.map(b => b.x + b.w)) - Math.min(...boxes.map(b => b.x));

  if (totalYSpread > totalXSpread * 1.3) {
    return { direction: 'vertical', confidence: 0.65, spacing: Math.max(0, Math.round(avgYSpacing)), reason: 'Vertical spread dominant (fallback)' };
  }
  if (totalXSpread > totalYSpread * 1.3) {
    return { direction: 'horizontal', confidence: 0.65, spacing: Math.max(0, Math.round(avgXSpacing)), reason: 'Horizontal spread dominant (fallback)' };
  }

  return { direction: 'overlap', confidence: 0.5, spacing: 0, reason: 'Ambiguous layout → Box with absolute positioning' };
}

/* ═══════════════════════════════════════════
   STEP 4: VALIDATION LAYER
   ═══════════════════════════════════════════ */

export interface ValidationIssue {
  nodeId: string;
  nodeName: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  fix?: string;
}

export function validateTree(node: FigmaNode, issues: ValidationIssue[] = []): ValidationIssue[] {
  // Check overlapping children
  if (node.children && node.children.length > 1) {
    const boxes = node.children
      .filter(c => c.absoluteBoundingBox)
      .map(c => ({ id: c.id, name: c.name, ...c.absoluteBoundingBox! }));

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          issues.push({
            nodeId: node.id, nodeName: node.name,
            severity: 'warning', category: 'Overlap',
            message: `"${a.name}" overlaps with "${b.name}"`,
            fix: 'Use Auto Layout or reposition elements'
          });
        }
      }
    }
  }

  // Missing Auto Layout
  if (node.children && node.children.length > 2 && !node.layoutMode && node.type === 'FRAME') {
    issues.push({
      nodeId: node.id, nodeName: node.name,
      severity: 'info', category: 'Auto Layout',
      message: `Frame "${node.name}" has ${node.children.length} children without Auto Layout`,
      fix: 'Add Auto Layout for better code generation'
    });
  }

  // Missing text content
  if (node.type === 'TEXT' && !node.characters) {
    issues.push({
      nodeId: node.id, nodeName: node.name,
      severity: 'warning', category: 'Content',
      message: `Text node "${node.name}" has no text content`,
    });
  }

  // Inconsistent spacing
  if (node.children && node.children.length > 2 && node.layoutMode) {
    const boxes = node.children.filter(c => c.absoluteBoundingBox).map(c => c.absoluteBoundingBox!);
    if (boxes.length > 2) {
      const isVertical = node.layoutMode === 'VERTICAL';
      const sorted = [...boxes].sort((a, b) => isVertical ? a.y - b.y : a.x - b.x);
      const spacings = sorted.slice(1).map((b, i) => {
        const prev = sorted[i];
        return isVertical ? b.y - (prev.y + prev.height) : b.x - (prev.x + prev.width);
      });
      const uniqueSpacings = new Set(spacings.map(s => Math.round(s)));
      if (uniqueSpacings.size > 2) {
        issues.push({
          nodeId: node.id, nodeName: node.name,
          severity: 'info', category: 'Spacing',
          message: `Inconsistent spacing in "${node.name}" (${uniqueSpacings.size} different values)`,
          fix: 'Use consistent spacing in Auto Layout'
        });
      }
    }
  }

  // Very deep nesting
  function getDepth(n: FigmaNode, d: number): number {
    if (!n.children || n.children.length === 0) return d;
    return Math.max(...n.children.map(c => getDepth(c, d + 1)));
  }
  const depth = getDepth(node, 0);
  if (depth > 8) {
    issues.push({
      nodeId: node.id, nodeName: node.name,
      severity: 'warning', category: 'Nesting',
      message: `Deep nesting (${depth} levels) in "${node.name}" — may cause complex code`,
      fix: 'Flatten hierarchy or use components'
    });
  }

  // Recurse
  for (const child of node.children || []) {
    validateTree(child, issues);
  }

  return issues;
}

/* ═══════════════════════════════════════════
   FULL PIPELINE
   ═══════════════════════════════════════════ */

export interface PipelineResult {
  cleanedTree: FigmaNode;
  issues: ValidationIssue[];
  stats: {
    nodesRemoved: number;
    nodesNormalized: number;
    issueCount: { error: number; warning: number; info: number };
  };
}

function countNodes(node: FigmaNode): number {
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0);
}

export function runPipeline(raw: FigmaNode): PipelineResult {
  const originalCount = countNodes(raw);

  // Step 1: Clean
  const cleaned = cleanTree(raw);
  if (!cleaned) {
    return {
      cleanedTree: raw,
      issues: [{ nodeId: raw.id, nodeName: raw.name, severity: 'error', category: 'Clean', message: 'Entire tree was removed during cleaning' }],
      stats: { nodesRemoved: originalCount, nodesNormalized: 0, issueCount: { error: 1, warning: 0, info: 0 } }
    };
  }

  const cleanedCount = countNodes(cleaned);

  // Step 2: Normalize
  const normalized = normalizeTree(cleaned);

  // Step 3: Validate
  const issues = validateTree(normalized);

  const issueCount = {
    error: issues.filter(i => i.severity === 'error').length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  return {
    cleanedTree: normalized,
    issues,
    stats: {
      nodesRemoved: originalCount - cleanedCount,
      nodesNormalized: cleanedCount,
      issueCount,
    },
  };
}
