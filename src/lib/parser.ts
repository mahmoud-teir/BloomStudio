/**
 * Simplified Figma Node to Internal Representation (IR)
 */

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  style?: Record<string, any>;
  characters?: string;
  fills?: any[];
  strokes?: any[];
  strokeWeight?: number;
  cornerRadius?: number;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  opacity?: number;
  visible?: boolean;
}

export function parseFigmaColor(color: { r: number; g: number; b: number; a: number }) {
  if (!color) return 'transparent';
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a})`;
}

export function extractStyles(node: FigmaNode): Record<string, string> {
  const styles: Record<string, string> = {};

  if (node.visible === false) {
    styles.display = 'none';
  }

  // Auto Layout
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    styles.display = 'flex';
    styles.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.itemSpacing) styles.gap = `${node.itemSpacing}px`;
    
    if (node.paddingTop) styles.paddingTop = `${node.paddingTop}px`;
    if (node.paddingBottom) styles.paddingBottom = `${node.paddingBottom}px`;
    if (node.paddingLeft) styles.paddingLeft = `${node.paddingLeft}px`;
    if (node.paddingRight) styles.paddingRight = `${node.paddingRight}px`;
    
    // Justify Content
    switch (node.primaryAxisAlignItems) {
      case 'MIN': styles.justifyContent = 'flex-start'; break;
      case 'MAX': styles.justifyContent = 'flex-end'; break;
      case 'CENTER': styles.justifyContent = 'center'; break;
      case 'SPACE_BETWEEN': styles.justifyContent = 'space-between'; break;
    }
    
    // Align Items
    switch (node.counterAxisAlignItems) {
      case 'MIN': styles.alignItems = 'flex-start'; break;
      case 'MAX': styles.alignItems = 'flex-end'; break;
      case 'CENTER': styles.alignItems = 'center'; break;
      case 'BASELINE': styles.alignItems = 'baseline'; break;
    }
  }

  // Dimensions (if not fully auto-layouted or if fixed)
  if (node.absoluteBoundingBox) {
    // Basic bounds, though in auto-layout these might be overridden by flex
    styles.width = `${node.absoluteBoundingBox.width}px`;
    styles.height = `${node.absoluteBoundingBox.height}px`;
  }

  // Fills (Backgrounds)
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false);
    if (solidFill && solidFill.color) {
      if (node.type === 'TEXT') {
        styles.color = parseFigmaColor(solidFill.color);
      } else {
        styles.backgroundColor = parseFigmaColor(solidFill.color);
      }
    }
  }

  // Border / Strokes
  if (node.strokes && node.strokes.length > 0) {
    const solidStroke = node.strokes.find(s => s.type === 'SOLID' && s.visible !== false);
    if (solidStroke && solidStroke.color) {
      styles.border = `${node.strokeWeight || 1}px solid ${parseFigmaColor(solidStroke.color)}`;
    }
  }

  // Border Radius
  if (node.cornerRadius) {
    styles.borderRadius = `${node.cornerRadius}px`;
  }

  // Typography
  if (node.style) {
    if (node.style.fontFamily) styles.fontFamily = `"${node.style.fontFamily}", sans-serif`;
    if (node.style.fontSize) styles.fontSize = `${node.style.fontSize}px`;
    if (node.style.fontWeight) styles.fontWeight = node.style.fontWeight.toString();
    if (node.style.textAlignHorizontal) {
      styles.textAlign = node.style.textAlignHorizontal.toLowerCase();
    }
    if (node.style.letterSpacing) styles.letterSpacing = `${node.style.letterSpacing}px`;
    if (node.style.lineHeightPx) styles.lineHeight = `${node.style.lineHeightPx}px`;
  }

  if (node.opacity !== undefined && node.opacity < 1) {
    styles.opacity = node.opacity.toString();
  }

  return styles;
}
