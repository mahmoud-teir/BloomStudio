/**
 * 🧠 Real Layout Detection Algorithm
 *
 * A proper geometric engine that analyzes child bounding boxes to determine
 * the correct layout type. This is the HARD part of Figma→Code conversion.
 *
 * Algorithm Pipeline:
 *   1. Extract & sort bounding boxes
 *   2. Detect alignment bands (vertical/horizontal)
 *   3. Calculate overlap matrix
 *   4. Detect grid patterns (2D grid → LazyVerticalGrid)
 *   5. Detect flow/wrap patterns (FlowRow/FlowColumn)
 *   6. Compute spacing uniformity
 *   7. Score each layout hypothesis and pick the winner
 */

/* ══════════════════════════════════════
   TYPES
   ══════════════════════════════════════ */

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number; // center X
  cy: number; // center Y
  idx: number; // original index
}

export type LayoutType =
  | 'column'       // vertical linear
  | 'row'          // horizontal linear
  | 'grid'         // 2D grid
  | 'wrap-row'     // horizontal with wrapping
  | 'wrap-column'  // vertical with wrapping
  | 'stack'        // overlapping (Z-axis)
  | 'absolute';    // free-form (no pattern)

export interface LayoutResult {
  type: LayoutType;
  confidence: number;    // 0.0 – 1.0
  reason: string;        // human-readable why
  spacing: number;       // dominant gap in px
  gridColumns?: number;  // for grid layouts
  gridRows?: number;
  alignment: 'start' | 'center' | 'end' | 'stretch' | 'mixed';
  crossAlignment: 'start' | 'center' | 'end' | 'stretch' | 'mixed';
  details: string[];     // step-by-step analysis log
}

/* ══════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════ */

function toBBox(raw: { x: number; y: number; width: number; height: number }, idx: number): BBox {
  return { x: raw.x, y: raw.y, w: raw.width, h: raw.height, cx: raw.x + raw.width / 2, cy: raw.y + raw.height / 2, idx };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
}

/** Coefficient of variation (0 = perfect uniformity, >1 = chaotic) */
function cv(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg === 0) return 0;
  return stddev(values) / Math.abs(avg);
}

/** IoU (Intersection over Union) for two boxes */
function iou(a: BBox, b: BBox): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Check if two boxes overlap at all */
function overlaps(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ══════════════════════════════════════
   STEP 1: ALIGNMENT BANDS
   Find if elements share X or Y positions
   ══════════════════════════════════════ */

interface AlignmentBand {
  axis: 'x' | 'y';
  position: number;
  members: number[];   // indices
  type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
}

function findAlignmentBands(boxes: BBox[], tolerance: number = 3): AlignmentBand[] {
  const bands: AlignmentBand[] = [];

  // Check vertical alignment (shared X positions → column)
  const leftEdges = boxes.map(b => b.x);
  const centerXs = boxes.map(b => b.cx);
  const rightEdges = boxes.map(b => b.x + b.w);

  // Check horizontal alignment (shared Y positions → row)
  const topEdges = boxes.map(b => b.y);
  const centerYs = boxes.map(b => b.cy);
  const bottomEdges = boxes.map(b => b.y + b.h);

  function clusterPositions(positions: number[], tol: number): { value: number; indices: number[] }[] {
    const clusters: { value: number; indices: number[] }[] = [];
    const sorted = positions.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);

    for (const item of sorted) {
      const existing = clusters.find(c => Math.abs(c.value - item.p) <= tol);
      if (existing) {
        existing.indices.push(item.i);
        existing.value = (existing.value * (existing.indices.length - 1) + item.p) / existing.indices.length;
      } else {
        clusters.push({ value: item.p, indices: [item.i] });
      }
    }
    return clusters.filter(c => c.indices.length >= 2);
  }

  // Find X alignment clusters
  for (const cluster of clusterPositions(leftEdges, tolerance)) {
    bands.push({ axis: 'x', position: cluster.value, members: cluster.indices, type: 'left' });
  }
  for (const cluster of clusterPositions(centerXs, tolerance)) {
    bands.push({ axis: 'x', position: cluster.value, members: cluster.indices, type: 'center' });
  }
  for (const cluster of clusterPositions(rightEdges, tolerance)) {
    bands.push({ axis: 'x', position: cluster.value, members: cluster.indices, type: 'right' });
  }

  // Find Y alignment clusters
  for (const cluster of clusterPositions(topEdges, tolerance)) {
    bands.push({ axis: 'y', position: cluster.value, members: cluster.indices, type: 'top' });
  }
  for (const cluster of clusterPositions(centerYs, tolerance)) {
    bands.push({ axis: 'y', position: cluster.value, members: cluster.indices, type: 'middle' });
  }
  for (const cluster of clusterPositions(bottomEdges, tolerance)) {
    bands.push({ axis: 'y', position: cluster.value, members: cluster.indices, type: 'bottom' });
  }

  return bands;
}

/* ══════════════════════════════════════
   STEP 2: OVERLAP ANALYSIS
   ══════════════════════════════════════ */

interface OverlapAnalysis {
  overlapRatio: number;    // 0-1, what fraction of pairs overlap
  maxIoU: number;          // highest IoU between any pair
  isStack: boolean;        // most elements overlap → Stack/Box
}

function analyzeOverlaps(boxes: BBox[]): OverlapAnalysis {
  if (boxes.length <= 1) return { overlapRatio: 0, maxIoU: 0, isStack: false };

  let overlapCount = 0;
  let maxIoU = 0;
  const totalPairs = (boxes.length * (boxes.length - 1)) / 2;

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) {
        overlapCount++;
        maxIoU = Math.max(maxIoU, iou(boxes[i], boxes[j]));
      }
    }
  }

  const ratio = totalPairs > 0 ? overlapCount / totalPairs : 0;
  return { overlapRatio: ratio, maxIoU, isStack: ratio > 0.4 || maxIoU > 0.3 };
}

/* ══════════════════════════════════════
   STEP 3: LINEAR LAYOUT DETECTION
   ══════════════════════════════════════ */

interface LinearScore {
  direction: 'vertical' | 'horizontal';
  score: number;  // 0-1
  spacing: number;
  spacingUniformity: number; // cv (lower = more uniform)
  alignment: 'start' | 'center' | 'end' | 'stretch' | 'mixed';
  reason: string;
}

function scoreLinearLayout(boxes: BBox[], direction: 'vertical' | 'horizontal'): LinearScore {
  const isVertical = direction === 'vertical';

  // Sort by primary axis
  const sorted = [...boxes].sort((a, b) => isVertical ? a.y - b.y : a.x - b.x);

  // 1. Calculate gaps between consecutive elements
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = isVertical
      ? curr.y - (prev.y + prev.h)
      : curr.x - (prev.x + prev.w);
    gaps.push(gap);
  }

  // 2. Check for negative gaps (overlaps in primary axis)
  const negativeGaps = gaps.filter(g => g < -2).length;
  if (negativeGaps > gaps.length * 0.3) {
    return { direction, score: 0.1, spacing: 0, spacingUniformity: 999, alignment: 'mixed', reason: 'Too many overlaps in primary axis' };
  }

  // 3. Spacing analysis
  const positiveGaps = gaps.filter(g => g >= 0);
  const medianSpacing = median(positiveGaps);
  const spacingCV = cv(positiveGaps);

  // 4. Cross-axis alignment analysis
  const crossPositions = sorted.map(b => isVertical ? b.x : b.y);
  const crossSizes = sorted.map(b => isVertical ? b.w : b.h);
  const crossEnds = sorted.map(b => isVertical ? b.x + b.w : b.y + b.h);
  const crossCenters = sorted.map(b => isVertical ? b.cx : b.cy);

  const startCV = cv(crossPositions);
  const endCV = cv(crossEnds);
  const centerCV = cv(crossCenters);

  let alignment: 'start' | 'center' | 'end' | 'stretch' | 'mixed';
  const minCV = Math.min(startCV, centerCV, endCV);

  // Check stretch: all ~same width/height on cross axis
  const sizeCV = cv(crossSizes);
  if (sizeCV < 0.05 && startCV < 0.05) {
    alignment = 'stretch';
  } else if (minCV < 0.05) {
    alignment = startCV === minCV ? 'start' : centerCV === minCV ? 'center' : 'end';
  } else if (minCV < 0.15) {
    alignment = startCV === minCV ? 'start' : centerCV === minCV ? 'center' : 'end';
  } else {
    alignment = 'mixed';
  }

  // 5. Score calculation
  let score = 0;

  // No overlaps in primary direction = good
  score += negativeGaps === 0 ? 0.3 : 0.1;

  // Uniform spacing = very good
  if (spacingCV < 0.05) score += 0.3;       // near-perfect
  else if (spacingCV < 0.15) score += 0.25;  // good
  else if (spacingCV < 0.3) score += 0.15;   // acceptable
  else score += 0.05;                         // messy

  // Good cross-axis alignment = good
  if (alignment !== 'mixed') score += 0.2;
  else score += 0.05;

  // Correct reading order (sorted indices should be ascending)
  const readingOrder = sorted.map(b => b.idx);
  const isOrderPreserved = readingOrder.every((v, i) => i === 0 || v > readingOrder[i - 1]);
  if (isOrderPreserved) score += 0.1;

  // Bonus: consistent sizes on primary axis
  const primarySizes = sorted.map(b => isVertical ? b.h : b.w);
  if (cv(primarySizes) < 0.2) score += 0.1;

  const reason = `${direction}: spacing=${Math.round(medianSpacing)}px (CV=${spacingCV.toFixed(2)}), align=${alignment}, overlaps=${negativeGaps}`;

  return { direction, score: Math.min(1, score), spacing: Math.max(0, Math.round(medianSpacing)), spacingUniformity: spacingCV, alignment, reason };
}

/* ══════════════════════════════════════
   STEP 4: GRID DETECTION
   ══════════════════════════════════════ */

interface GridResult {
  isGrid: boolean;
  columns: number;
  rows: number;
  score: number;
  reason: string;
}

function detectGrid(boxes: BBox[], tolerance: number = 5): GridResult {
  if (boxes.length < 4) return { isGrid: false, columns: 0, rows: 0, score: 0, reason: 'Too few elements for grid' };

  // Cluster Y positions (rows)
  const yClusters = clusterValues(boxes.map(b => b.cy), tolerance);
  // Cluster X positions (columns)
  const xClusters = clusterValues(boxes.map(b => b.cx), tolerance);

  const numRows = yClusters.length;
  const numCols = xClusters.length;

  // Must have at least 2 rows and 2 columns
  if (numRows < 2 || numCols < 2) {
    return { isGrid: false, columns: numCols, rows: numRows, score: 0, reason: `Not a grid: ${numRows}×${numCols}` };
  }

  // Check if elements are consistently sized
  const widths = boxes.map(b => b.w);
  const heights = boxes.map(b => b.h);
  const widthCV = cv(widths);
  const heightCV = cv(heights);
  const sizeConsistency = (widthCV < 0.15 && heightCV < 0.15);

  // Check if each row has similar column count
  const rowCounts = yClusters.map(yCluster => {
    return boxes.filter(b => Math.abs(b.cy - yCluster) <= tolerance).length;
  });
  const rowCV = cv(rowCounts);
  const consistentRows = rowCV < 0.2;

  // Check column positions are consistent across rows
  const colPositionsPerRow = yClusters.map(yCluster => {
    return boxes.filter(b => Math.abs(b.cy - yCluster) <= tolerance)
      .map(b => b.cx)
      .sort((a, b) => a - b);
  });

  let colAlignmentScore = 0;
  if (colPositionsPerRow.length >= 2) {
    const refRow = colPositionsPerRow[0];
    for (let r = 1; r < colPositionsPerRow.length; r++) {
      const row = colPositionsPerRow[r];
      const matches = refRow.filter(pos => row.some(p => Math.abs(p - pos) <= tolerance)).length;
      colAlignmentScore += matches / Math.max(refRow.length, 1);
    }
    colAlignmentScore /= (colPositionsPerRow.length - 1);
  }

  let score = 0;
  if (sizeConsistency) score += 0.3;
  if (consistentRows) score += 0.3;
  score += colAlignmentScore * 0.4;

  const isGrid = score >= 0.6;

  return {
    isGrid,
    columns: numCols,
    rows: numRows,
    score,
    reason: `Grid ${numRows}×${numCols}: size-cv=${widthCV.toFixed(2)}/${heightCV.toFixed(2)}, row-cv=${rowCV.toFixed(2)}, col-align=${colAlignmentScore.toFixed(2)}`
  };
}

function clusterValues(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[] = [];
  let current: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push(current.reduce((a, b) => a + b, 0) / current.length);
      current = [sorted[i]];
    }
  }
  clusters.push(current.reduce((a, b) => a + b, 0) / current.length);
  return clusters;
}

/* ══════════════════════════════════════
   STEP 5: WRAP DETECTION
   ══════════════════════════════════════ */

interface WrapResult {
  isWrap: boolean;
  direction: 'row' | 'column';
  score: number;
  reason: string;
}

function detectWrap(boxes: BBox[], tolerance: number = 5): WrapResult {
  if (boxes.length < 3) return { isWrap: false, direction: 'row', score: 0, reason: 'Too few elements' };

  // Wrap-row: elements go left-to-right, then wrap to next line
  const sortedByY = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const yRows = clusterValues(sortedByY.map(b => b.cy), tolerance);

  if (yRows.length >= 2) {
    // Check each row is sorted left-to-right
    let rowsSorted = 0;
    for (const yCenter of yRows) {
      const rowBoxes = sortedByY.filter(b => Math.abs(b.cy - yCenter) <= tolerance);
      const xValues = rowBoxes.map(b => b.x);
      const isSorted = xValues.every((v, i) => i === 0 || v >= xValues[i - 1] - tolerance);
      if (isSorted) rowsSorted++;
    }

    const wrapScore = rowsSorted / yRows.length;
    if (wrapScore >= 0.8) {
      return { isWrap: true, direction: 'row', score: wrapScore, reason: `FlowRow: ${yRows.length} rows, ${(wrapScore * 100).toFixed(0)}% sorted` };
    }
  }

  // Wrap-column: elements go top-to-bottom, then wrap to next column
  const sortedByX = [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
  const xCols = clusterValues(sortedByX.map(b => b.cx), tolerance);

  if (xCols.length >= 2) {
    let colsSorted = 0;
    for (const xCenter of xCols) {
      const colBoxes = sortedByX.filter(b => Math.abs(b.cx - xCenter) <= tolerance);
      const yValues = colBoxes.map(b => b.y);
      const isSorted = yValues.every((v, i) => i === 0 || v >= yValues[i - 1] - tolerance);
      if (isSorted) colsSorted++;
    }
    const wrapScore = colsSorted / xCols.length;
    if (wrapScore >= 0.8) {
      return { isWrap: true, direction: 'column', score: wrapScore, reason: `FlowColumn: ${xCols.length} cols, ${(wrapScore * 100).toFixed(0)}% sorted` };
    }
  }

  return { isWrap: false, direction: 'row', score: 0, reason: 'No wrap pattern' };
}

/* ══════════════════════════════════════
   MAIN ALGORITHM: DETECT LAYOUT
   ══════════════════════════════════════ */

export function detectLayout(rawBoxes: { x: number; y: number; width: number; height: number }[]): LayoutResult {
  const details: string[] = [];

  if (rawBoxes.length === 0) {
    return { type: 'column', confidence: 1, reason: 'No children', spacing: 0, alignment: 'start', crossAlignment: 'start', details: [] };
  }
  if (rawBoxes.length === 1) {
    return { type: 'column', confidence: 1, reason: 'Single child', spacing: 0, alignment: 'center', crossAlignment: 'center', details: [] };
  }

  const boxes = rawBoxes.map((b, i) => toBBox(b, i));
  details.push(`📦 ${boxes.length} elements to analyze`);

  // ── Step 1: Overlap Analysis ──
  const overlapResult = analyzeOverlaps(boxes);
  details.push(`🔍 Overlap: ratio=${(overlapResult.overlapRatio * 100).toFixed(0)}%, maxIoU=${overlapResult.maxIoU.toFixed(2)}`);

  if (overlapResult.isStack) {
    details.push(`📐 Decision: Stack (high overlap ratio)`);
    return {
      type: 'stack',
      confidence: 0.7 + overlapResult.overlapRatio * 0.3,
      reason: `${(overlapResult.overlapRatio * 100).toFixed(0)}% of pairs overlap (maxIoU=${overlapResult.maxIoU.toFixed(2)}) → Box/Stack`,
      spacing: 0,
      alignment: 'center',
      crossAlignment: 'center',
      details
    };
  }

  // ── Step 2: Score Linear Layouts ──
  const verticalScore = scoreLinearLayout(boxes, 'vertical');
  const horizontalScore = scoreLinearLayout(boxes, 'horizontal');
  details.push(`⬇️ Vertical: score=${verticalScore.score.toFixed(2)} (${verticalScore.reason})`);
  details.push(`➡️ Horizontal: score=${horizontalScore.score.toFixed(2)} (${horizontalScore.reason})`);

  // ── Step 3: Grid Detection ──
  const gridResult = detectGrid(boxes);
  details.push(`🔲 Grid: ${gridResult.reason}`);

  // ── Step 4: Wrap Detection ──
  const wrapResult = detectWrap(boxes);
  if (wrapResult.isWrap) {
    details.push(`🔄 Wrap: ${wrapResult.reason}`);
  }

  // ── Step 5: Pick Winner ──

  // Grid wins if score is high enough (>= 0.6) and beats both linear
  if (gridResult.isGrid && gridResult.score > Math.max(verticalScore.score, horizontalScore.score) * 0.8) {
    details.push(`📐 Decision: Grid ${gridResult.rows}×${gridResult.columns}`);
    return {
      type: 'grid',
      confidence: gridResult.score,
      reason: gridResult.reason,
      spacing: verticalScore.spacing,
      gridColumns: gridResult.columns,
      gridRows: gridResult.rows,
      alignment: verticalScore.alignment,
      crossAlignment: horizontalScore.alignment,
      details
    };
  }

  // Wrap wins if detected and linear scores are close
  if (wrapResult.isWrap && Math.abs(verticalScore.score - horizontalScore.score) < 0.15) {
    details.push(`📐 Decision: Wrap-${wrapResult.direction}`);
    return {
      type: wrapResult.direction === 'row' ? 'wrap-row' : 'wrap-column',
      confidence: wrapResult.score * 0.9,
      reason: wrapResult.reason,
      spacing: wrapResult.direction === 'row' ? horizontalScore.spacing : verticalScore.spacing,
      alignment: 'start',
      crossAlignment: 'start',
      details
    };
  }

  // Linear layout: pick the higher-scoring direction
  const margin = Math.abs(verticalScore.score - horizontalScore.score);

  if (verticalScore.score > horizontalScore.score && verticalScore.score >= 0.3) {
    details.push(`📐 Decision: Column (V=${verticalScore.score.toFixed(2)} > H=${horizontalScore.score.toFixed(2)}, margin=${margin.toFixed(2)})`);
    return {
      type: 'column',
      confidence: Math.min(1, verticalScore.score + margin * 0.5),
      reason: verticalScore.reason,
      spacing: verticalScore.spacing,
      alignment: verticalScore.alignment,
      crossAlignment: horizontalScore.alignment,
      details
    };
  }

  if (horizontalScore.score > verticalScore.score && horizontalScore.score >= 0.3) {
    details.push(`📐 Decision: Row (H=${horizontalScore.score.toFixed(2)} > V=${verticalScore.score.toFixed(2)}, margin=${margin.toFixed(2)})`);
    return {
      type: 'row',
      confidence: Math.min(1, horizontalScore.score + margin * 0.5),
      reason: horizontalScore.reason,
      spacing: horizontalScore.spacing,
      alignment: horizontalScore.alignment,
      crossAlignment: verticalScore.alignment,
      details
    };
  }

  // Ambiguous: both low → absolute positioning
  details.push(`📐 Decision: Absolute (V=${verticalScore.score.toFixed(2)}, H=${horizontalScore.score.toFixed(2)} — both too low or tied)`);
  return {
    type: 'absolute',
    confidence: 0.4,
    reason: `Ambiguous layout (V=${verticalScore.score.toFixed(2)}, H=${horizontalScore.score.toFixed(2)}) → free positioning`,
    spacing: 0,
    alignment: 'mixed',
    crossAlignment: 'mixed',
    details
  };
}

/* ══════════════════════════════════════
   ALIGNMENT ANALYSIS (exported)
   ══════════════════════════════════════ */

export function analyzeAlignments(rawBoxes: { x: number; y: number; width: number; height: number }[]) {
  const boxes = rawBoxes.map((b, i) => toBBox(b, i));
  return findAlignmentBands(boxes);
}
