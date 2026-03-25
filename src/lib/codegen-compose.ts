/**
 * Figma Node → Jetpack Compose (.kt) Code Generator
 *
 * Generates compilable @Composable functions from the Figma IR.
 * Covers: Row/Column (auto-layout), Box, Text, Image, Icon,
 *         Modifier chains (size, padding, background, border, shape, alpha).
 */

import { FigmaNode, parseFigmaColor } from './parser';

/* ────────────────────── helpers ────────────────────── */

function figmaColorToComposeColor(color: { r: number; g: number; b: number; a: number }): string {
  if (!color) return 'Color.Transparent';
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 255);
  if (a === 255) {
    return `Color(0xFF${hex(r)}${hex(g)}${hex(b)})`;
  }
  return `Color(0x${hex(a)}${hex(r)}${hex(g)}${hex(b)})`;
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

function sanitizeName(raw: string): string {
  // PascalCase, letters+digits only
  return raw
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .split(/[\s_\-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function dpVal(px: number | undefined): string {
  if (px === undefined || px === 0) return '0.dp';
  return `${Math.round(px)}.dp`;
}

function spVal(px: number | undefined): string {
  if (px === undefined || px === 0) return '14.sp';
  return `${Math.round(px)}.sp`;
}

function fontWeightCompose(weight: number | undefined): string {
  if (!weight) return 'FontWeight.Normal';
  if (weight <= 100) return 'FontWeight.Thin';
  if (weight <= 200) return 'FontWeight.ExtraLight';
  if (weight <= 300) return 'FontWeight.Light';
  if (weight <= 400) return 'FontWeight.Normal';
  if (weight <= 500) return 'FontWeight.Medium';
  if (weight <= 600) return 'FontWeight.SemiBold';
  if (weight <= 700) return 'FontWeight.Bold';
  if (weight <= 800) return 'FontWeight.ExtraBold';
  return 'FontWeight.Black';
}

function textAlignCompose(align: string | undefined): string {
  switch (align?.toUpperCase()) {
    case 'CENTER': return 'TextAlign.Center';
    case 'RIGHT': return 'TextAlign.End';
    case 'JUSTIFIED': return 'TextAlign.Justify';
    default: return 'TextAlign.Start';
  }
}

function horizontalArrangement(align: string | undefined): string {
  switch (align) {
    case 'CENTER': return 'Arrangement.Center';
    case 'MAX': return 'Arrangement.End';
    case 'SPACE_BETWEEN': return 'Arrangement.SpaceBetween';
    default: return 'Arrangement.Start';
  }
}

function verticalArrangement(align: string | undefined): string {
  switch (align) {
    case 'CENTER': return 'Arrangement.Center';
    case 'MAX': return 'Arrangement.Bottom';
    case 'SPACE_BETWEEN': return 'Arrangement.SpaceBetween';
    default: return 'Arrangement.Top';
  }
}

function crossAxisAlignment(align: string | undefined, isRow: boolean): string {
  if (isRow) {
    switch (align) {
      case 'CENTER': return 'Alignment.CenterVertically';
      case 'MAX': return 'Alignment.Bottom';
      case 'MIN': return 'Alignment.Top';
      default: return 'Alignment.Top';
    }
  } else {
    switch (align) {
      case 'CENTER': return 'Alignment.CenterHorizontally';
      case 'MAX': return 'Alignment.End';
      case 'MIN': return 'Alignment.Start';
      default: return 'Alignment.Start';
    }
  }
}

/* ────────────────── modifier builder ──────────────── */

function buildModifier(node: FigmaNode): string {
  const parts: string[] = [];

  // Size
  if (node.absoluteBoundingBox) {
    const w = Math.round(node.absoluteBoundingBox.width);
    const h = Math.round(node.absoluteBoundingBox.height);
    if (w && h) {
      parts.push(`.size(width = ${w}.dp, height = ${h}.dp)`);
    }
  }

  // Padding (uniform or per-side)
  const pt = node.paddingTop || 0;
  const pb = node.paddingBottom || 0;
  const pl = node.paddingLeft || 0;
  const pr = node.paddingRight || 0;
  if (pt || pb || pl || pr) {
    if (pt === pb && pl === pr && pt === pl) {
      parts.push(`.padding(${dpVal(pt)})`);
    } else {
      parts.push(`.padding(start = ${dpVal(pl)}, top = ${dpVal(pt)}, end = ${dpVal(pr)}, bottom = ${dpVal(pb)})`);
    }
  }

  // Background
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false);
    if (solidFill?.color && node.type !== 'TEXT') {
      const composeColor = figmaColorToComposeColor(solidFill.color);
      if (node.cornerRadius) {
        parts.push(`.background(color = ${composeColor}, shape = RoundedCornerShape(${Math.round(node.cornerRadius)}.dp))`);
      } else {
        parts.push(`.background(${composeColor})`);
      }
    }
  }

  // Border
  if (node.strokes && node.strokes.length > 0) {
    const solidStroke = node.strokes.find(s => s.type === 'SOLID' && s.visible !== false);
    if (solidStroke?.color) {
      const strokeColor = figmaColorToComposeColor(solidStroke.color);
      const strokeW = node.strokeWeight || 1;
      if (node.cornerRadius) {
        parts.push(`.border(width = ${strokeW}.dp, color = ${strokeColor}, shape = RoundedCornerShape(${Math.round(node.cornerRadius)}.dp))`);
      } else {
        parts.push(`.border(width = ${strokeW}.dp, color = ${strokeColor})`);
      }
    }
  }

  // Corner radius as clip (if no bg/border already applied it)
  if (node.cornerRadius && !node.fills?.some(f => f.type === 'SOLID' && f.visible !== false) && (!node.strokes || node.strokes.length === 0)) {
    parts.push(`.clip(RoundedCornerShape(${Math.round(node.cornerRadius)}.dp))`);
  }

  // Alpha / opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    parts.push(`.alpha(${node.opacity.toFixed(2)}f)`);
  }

  if (parts.length === 0) return 'Modifier';
  return 'Modifier\n            ' + parts.join('\n            ');
}

/* ──────────────── node → composable ───────────────── */

function isIconNode(node: FigmaNode): boolean {
  if (node.name?.toLowerCase().includes('icon')) return true;
  if (node.absoluteBoundingBox && node.absoluteBoundingBox.width <= 64 && node.absoluteBoundingBox.height <= 64 && node.type !== 'TEXT') return true;
  return false;
}

function isImageNode(node: FigmaNode): boolean {
  if (node.name?.toLowerCase().startsWith('image')) return true;
  if (node.fills?.some(f => f.type === 'IMAGE')) return true;
  return false;
}

export function generateCompose(node: FigmaNode, indent: string = '    '): string {
  if (node.visible === false) return '';

  const mod = buildModifier(node);
  const nextIndent = indent + '    ';

  // ── Icon ──
  if (isIconNode(node)) {
    const iconName = sanitizeName(node.name) || 'CustomIcon';
    const w = node.absoluteBoundingBox?.width || 24;
    const h = node.absoluteBoundingBox?.height || 24;
    return `${indent}Icon(\n${indent}    painter = painterResource(id = R.drawable.${iconName.toLowerCase()}),\n${indent}    contentDescription = "${node.name}",\n${indent}    modifier = Modifier.size(${Math.round(w)}.dp)\n${indent})\n`;
  }

  // ── Image ──
  if (isImageNode(node)) {
    const w = node.absoluteBoundingBox?.width || 100;
    const h = node.absoluteBoundingBox?.height || 100;
    return `${indent}Image(\n${indent}    painter = painterResource(id = R.drawable.${sanitizeName(node.name).toLowerCase()}),\n${indent}    contentDescription = "${node.name}",\n${indent}    contentScale = ContentScale.Crop,\n${indent}    modifier = Modifier.size(width = ${Math.round(w)}.dp, height = ${Math.round(h)}.dp)\n${indent})\n`;
  }

  // ── Text ──
  if (node.type === 'TEXT') {
    const text = (node.characters || '').replace(/"/g, '\\"');
    const fontSize = spVal(node.style?.fontSize);
    const fontWeight = fontWeightCompose(node.style?.fontWeight);
    const textAlign = textAlignCompose(node.style?.textAlignHorizontal);

    let textColor = 'Color.Unspecified';
    if (node.fills && node.fills.length > 0) {
      const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false);
      if (solidFill?.color) {
        textColor = figmaColorToComposeColor(solidFill.color);
      }
    }

    const letterSpacing = node.style?.letterSpacing ? `\n${indent}    letterSpacing = ${node.style.letterSpacing.toFixed(1)}.sp,` : '';
    const lineHeight = node.style?.lineHeightPx ? `\n${indent}    lineHeight = ${Math.round(node.style.lineHeightPx)}.sp,` : '';

    return `${indent}Text(\n${indent}    text = "${text}",\n${indent}    fontSize = ${fontSize},\n${indent}    fontWeight = ${fontWeight},\n${indent}    color = ${textColor},\n${indent}    textAlign = ${textAlign},${letterSpacing}${lineHeight}\n${indent})\n`;
  }

  // ── Auto-layout → Row / Column ──
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    const isRow = node.layoutMode === 'HORIZONTAL';
    const container = isRow ? 'Row' : 'Column';
    const spacing = node.itemSpacing ? `${Math.round(node.itemSpacing)}.dp` : '0.dp';

    let arrangementParam: string;
    let alignmentParam: string;

    if (isRow) {
      arrangementParam = `horizontalArrangement = ${horizontalArrangement(node.primaryAxisAlignItems)}`;
      alignmentParam = `verticalAlignment = ${crossAxisAlignment(node.counterAxisAlignItems, true)}`;
    } else {
      arrangementParam = `verticalArrangement = ${verticalArrangement(node.primaryAxisAlignItems)}`;
      alignmentParam = `horizontalAlignment = ${crossAxisAlignment(node.counterAxisAlignItems, false)}`;
    }

    // Add spacing to arrangement if present
    if (node.itemSpacing && node.itemSpacing > 0) {
      if (isRow) {
        arrangementParam = `horizontalArrangement = Arrangement.spacedBy(${spacing})`;
      } else {
        arrangementParam = `verticalArrangement = Arrangement.spacedBy(${spacing})`;
      }
    }

    let body = '';
    if (node.children) {
      for (const child of node.children) {
        body += generateCompose(child, nextIndent);
      }
    }

    return `${indent}${container}(\n${indent}    modifier = ${mod},\n${indent}    ${arrangementParam},\n${indent}    ${alignmentParam}\n${indent}) {\n${body}${indent}}\n`;
  }

  // ── Fallback → Box ──
  let body = '';
  if (node.children) {
    for (const child of node.children) {
      body += generateCompose(child, nextIndent);
    }
  }

  return `${indent}Box(\n${indent}    modifier = ${mod}\n${indent}) {\n${body}${indent}}\n`;
}

/* ────────── full composable file generator ─────────── */

export function generateComposeFile(node: FigmaNode, componentName: string): string {
  const safeComponentName = sanitizeName(componentName) || 'FigmaScreen';
  const innerCode = generateCompose(node, '        ');

  return `package com.example.figmaexport.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ${safeComponentName}(
    modifier: Modifier = Modifier
) {
${innerCode}
}

@Preview(showBackground = true)
@Composable
private fun ${safeComponentName}Preview() {
    ${safeComponentName}()
}
`;
}
