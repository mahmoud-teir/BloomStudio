/**
 * Design System Extractor 🎨
 *
 * Extracts a complete design system from the Figma tree:
 *   - Color palette (with auto-naming: primary, secondary, etc.)
 *   - Typography scale (font families, sizes, weights)
 *   - Spacing scale (padding/margin values)
 *   - Border radii
 *   - Shadows (if available)
 *
 * Generates theme files for each platform.
 */

import { FigmaNode } from './parser';

/* ──────────── Types ──────────── */

export interface DesignToken {
  value: string;
  count: number;  // how often it appears
}

export interface DesignSystem {
  colors: { hex: string; name: string; count: number; opacity: number }[];
  fonts: { family: string; sizes: number[]; weights: number[] }[];
  spacings: number[];
  radii: number[];
}

/* ──────────── Color Utils ──────────── */

function rgbaToHex(r: number, g: number, b: number, a?: number): string {
  const rr = Math.round(r * 255).toString(16).padStart(2, '0');
  const gg = Math.round(g * 255).toString(16).padStart(2, '0');
  const bb = Math.round(b * 255).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`.toUpperCase();
}

const COLOR_NAMES = [
  'primary', 'secondary', 'accent', 'background', 'surface',
  'text-primary', 'text-secondary', 'border', 'error', 'success',
  'warning', 'info', 'muted', 'card', 'overlay'
];

/* ──────────── Main Extractor ──────────── */

export function extractDesignSystem(root: FigmaNode): DesignSystem {
  const colorMap = new Map<string, { count: number; opacity: number }>();
  const fontMap = new Map<string, { sizes: Set<number>; weights: Set<number> }>();
  const spacingSet = new Map<number, number>(); // value → count
  const radiiSet = new Map<number, number>();

  function traverse(node: FigmaNode) {
    // Colors from fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
          const hex = rgbaToHex(fill.color.r, fill.color.g, fill.color.b);
          const existing = colorMap.get(hex);
          if (existing) {
            existing.count++;
          } else {
            colorMap.set(hex, { count: 1, opacity: fill.opacity ?? fill.color.a ?? 1 });
          }
        }
      }
    }

    // Colors from strokes
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
          const hex = rgbaToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          const existing = colorMap.get(hex);
          if (existing) {
            existing.count++;
          } else {
            colorMap.set(hex, { count: 1, opacity: stroke.color.a ?? 1 });
          }
        }
      }
    }

    // Typography
    if (node.type === 'TEXT' && node.style) {
      const family = node.style.fontFamily || 'System';
      const size = node.style.fontSize || 14;
      const weight = node.style.fontWeight || 400;

      const existing = fontMap.get(family);
      if (existing) {
        existing.sizes.add(Math.round(size));
        existing.weights.add(weight);
      } else {
        fontMap.set(family, { sizes: new Set([Math.round(size)]), weights: new Set([weight]) });
      }
    }

    // Spacing
    for (const val of [node.paddingTop, node.paddingBottom, node.paddingLeft, node.paddingRight, node.itemSpacing]) {
      if (val && val > 0) {
        const rounded = Math.round(val);
        spacingSet.set(rounded, (spacingSet.get(rounded) || 0) + 1);
      }
    }

    // Corner radius
    if (node.cornerRadius && node.cornerRadius > 0) {
      const rounded = Math.round(node.cornerRadius);
      radiiSet.set(rounded, (radiiSet.get(rounded) || 0) + 1);
    }

    // Recurse
    for (const child of node.children || []) {
      traverse(child);
    }
  }

  traverse(root);

  // Build sorted results
  const colors = Array.from(colorMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([hex, data], i) => ({
      hex,
      name: i < COLOR_NAMES.length ? COLOR_NAMES[i] : `color-${i + 1}`,
      count: data.count,
      opacity: data.opacity,
    }));

  const fonts = Array.from(fontMap.entries())
    .sort((a, b) => b[1].sizes.size - a[1].sizes.size)
    .map(([family, data]) => ({
      family,
      sizes: Array.from(data.sizes).sort((a, b) => a - b),
      weights: Array.from(data.weights).sort((a, b) => a - b),
    }));

  const spacings = Array.from(spacingSet.keys()).sort((a, b) => a - b);
  const radii = Array.from(radiiSet.keys()).sort((a, b) => a - b);

  return { colors, fonts, spacings, radii };
}

/* ═══════════════════════════════════════════
   THEME GENERATORS
   ═══════════════════════════════════════════ */

export function generateComposeTheme(ds: DesignSystem): string {
  const colorVals = ds.colors.slice(0, 12).map(c => {
    const name = c.name.replace(/-/g, '_').replace(/\s/g, '');
    const hex = c.hex.replace('#', '');
    return `    val ${name} = Color(0xFF${hex})`;
  }).join('\n');

  const typoVals = ds.fonts.map(f => {
    return f.sizes.map(s => {
      const name = `${f.family.replace(/\s/g, '')}${s}`;
      return `    val ${name} = TextStyle(\n        fontFamily = FontFamily.Default,\n        fontSize = ${s}.sp\n    )`;
    }).join('\n');
  }).join('\n');

  return `package com.example.figmaexport.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp

object AppColors {
${colorVals}
}

object AppTypography {
${typoVals}
}

object AppSpacing {
${ds.spacings.map(s => `    val sp${s} = ${s}.dp`).join('\n')}
}

object AppRadius {
${ds.radii.map(r => `    val r${r} = ${r}.dp`).join('\n')}
}
`;
}

export function generateSwiftUITheme(ds: DesignSystem): string {
  const colorVals = ds.colors.slice(0, 12).map(c => {
    const hex = c.hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return `    static let ${c.name.replace(/-/g, '_')} = Color(red: ${r.toFixed(3)}, green: ${g.toFixed(3)}, blue: ${b.toFixed(3)})`;
  }).join('\n');

  return `import SwiftUI

struct AppColors {
${colorVals}
}

struct AppSpacing {
${ds.spacings.map(s => `    static let sp${s}: CGFloat = ${s}`).join('\n')}
}

struct AppRadius {
${ds.radii.map(r => `    static let r${r}: CGFloat = ${r}`).join('\n')}
}
`;
}

export function generateCSSTheme(ds: DesignSystem): string {
  const colors = ds.colors.slice(0, 15).map(c =>
    `  --${c.name}: ${c.hex};`
  ).join('\n');

  const fontImports = ds.fonts.map(f =>
    `/* Font: ${f.family} — sizes: ${f.sizes.join(', ')}px */`
  ).join('\n');

  const spacings = ds.spacings.map(s =>
    `  --spacing-${s}: ${s}px;`
  ).join('\n');

  const radii = ds.radii.map(r =>
    `  --radius-${r}: ${r}px;`
  ).join('\n');

  return `/* Auto-generated Design System from Figma */
${fontImports}

:root {
  /* Colors */
${colors}

  /* Spacing */
${spacings}

  /* Border Radius */
${radii}

  /* Typography */
${ds.fonts.map(f => `  --font-${f.family.toLowerCase().replace(/\s/g, '-')}: '${f.family}', sans-serif;`).join('\n')}
}
`;
}

export function generateFlutterTheme(ds: DesignSystem): string {
  const colorVals = ds.colors.slice(0, 12).map(c => {
    const hex = c.hex.replace('#', '');
    return `  static const ${c.name.replace(/-/g, '_')} = Color(0xFF${hex});`;
  }).join('\n');

  return `import 'package:flutter/material.dart';

class AppColors {
${colorVals}
}

class AppSpacing {
${ds.spacings.map(s => `  static const double sp${s} = ${s};`).join('\n')}
}

class AppRadius {
${ds.radii.map(r => `  static const double r${r} = ${r};`).join('\n')}
}
`;
}
