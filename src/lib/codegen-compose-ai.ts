/**
 * AI-Powered Compose Code Generator
 *
 * Takes the semantic UINode tree from smart-parser.ts and generates
 * intelligent Jetpack Compose code that UNDERSTANDS the design:
 *   - LazyColumn for scrollable lists
 *   - Reusable @Composable functions extracted automatically
 *   - Card, Button, TextField mapped to Material3
 *   - TopAppBar / NavigationBar for app chrome
 */

import { UINode, SemanticType } from './smart-parser';

/* ──────────── Helpers ──────────── */

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

function figmaColorToCompose(color: { r: number; g: number; b: number; a: number }): string {
  if (!color) return 'Color.Unspecified';
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 255);
  return a === 255
    ? `Color(0xFF${hex(r)}${hex(g)}${hex(b)})`
    : `Color(0x${hex(a)}${hex(r)}${hex(g)}${hex(b)})`;
}

function dpVal(px: number | undefined): string {
  return px ? `${Math.round(px)}.dp` : '0.dp';
}

function spVal(px: number | undefined): string {
  return px ? `${Math.round(px)}.sp` : '14.sp';
}

function fontWeightCompose(w: number | undefined): string {
  if (!w) return 'FontWeight.Normal';
  if (w <= 300) return 'FontWeight.Light';
  if (w <= 400) return 'FontWeight.Normal';
  if (w <= 500) return 'FontWeight.Medium';
  if (w <= 600) return 'FontWeight.SemiBold';
  if (w <= 700) return 'FontWeight.Bold';
  return 'FontWeight.ExtraBold';
}

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .split(/[\s_\-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('') || 'Component';
}

/* ──────────── Modifier Builder ──────────── */

function buildModifier(node: UINode, extraParts: string[] = []): string {
  const parts: string[] = [...extraParts];

  if (node.width && node.height) {
    parts.push(`.size(width = ${Math.round(node.width)}.dp, height = ${Math.round(node.height)}.dp)`);
  }

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

  if (node.fills && node.fills.length > 0 && node.semanticType !== 'Text') {
    const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
    if (solid?.color) {
      const c = figmaColorToCompose(solid.color);
      parts.push(node.cornerRadius
        ? `.background(color = ${c}, shape = RoundedCornerShape(${Math.round(node.cornerRadius)}.dp))`
        : `.background(${c})`
      );
    }
  }

  if (node.strokes && node.strokes.length > 0) {
    const solid = node.strokes.find((s: any) => s.type === 'SOLID' && s.visible !== false);
    if (solid?.color) {
      const c = figmaColorToCompose(solid.color);
      const w = node.strokeWeight || 1;
      parts.push(node.cornerRadius
        ? `.border(width = ${w}.dp, color = ${c}, shape = RoundedCornerShape(${Math.round(node.cornerRadius)}.dp))`
        : `.border(width = ${w}.dp, color = ${c})`
      );
    }
  }

  if (node.cornerRadius && !node.fills?.some((f: any) => f.type === 'SOLID' && f.visible !== false) && (!node.strokes || node.strokes.length === 0)) {
    parts.push(`.clip(RoundedCornerShape(${Math.round(node.cornerRadius)}.dp))`);
  }

  if (node.opacity !== undefined && node.opacity < 1) {
    parts.push(`.alpha(${node.opacity.toFixed(2)}f)`);
  }

  return parts.length === 0
    ? 'modifier'
    : 'modifier\n                ' + parts.join('\n                ');
}

/* ──────────── Arrangement / Alignment ──────────── */

function primaryArrangement(node: UINode, isRow: boolean): string {
  const spacing = node.itemSpacing ? `${Math.round(node.itemSpacing)}.dp` : null;

  if (spacing) return isRow
    ? `horizontalArrangement = Arrangement.spacedBy(${spacing})`
    : `verticalArrangement = Arrangement.spacedBy(${spacing})`;

  switch (node.primaryAxisAlignItems) {
    case 'CENTER': return isRow ? 'horizontalArrangement = Arrangement.Center' : 'verticalArrangement = Arrangement.Center';
    case 'MAX': return isRow ? 'horizontalArrangement = Arrangement.End' : 'verticalArrangement = Arrangement.Bottom';
    case 'SPACE_BETWEEN': return isRow ? 'horizontalArrangement = Arrangement.SpaceBetween' : 'verticalArrangement = Arrangement.SpaceBetween';
    default: return isRow ? 'horizontalArrangement = Arrangement.Start' : 'verticalArrangement = Arrangement.Top';
  }
}

function crossAlignment(node: UINode, isRow: boolean): string {
  if (isRow) {
    switch (node.counterAxisAlignItems) {
      case 'CENTER': return 'verticalAlignment = Alignment.CenterVertically';
      case 'MAX': return 'verticalAlignment = Alignment.Bottom';
      default: return 'verticalAlignment = Alignment.Top';
    }
  } else {
    switch (node.counterAxisAlignItems) {
      case 'CENTER': return 'horizontalAlignment = Alignment.CenterHorizontally';
      case 'MAX': return 'horizontalAlignment = Alignment.End';
      default: return 'horizontalAlignment = Alignment.Start';
    }
  }
}

/* ──────────── Tracking reusable components ──────────── */

const extractedComponents = new Map<string, { name: string; node: UINode }>();

/* ──────────── Node → Compose Code ──────────── */

function generateFromNode(node: UINode, indent: string): string {
  const next = indent + '    ';
  const mod = buildModifier(node);

  switch (node.semanticType) {
    // ─── Text ───
    case 'Text': {
      const text = (node.text || '').replace(/"/g, '\\"');
      let textColor = 'Color.Unspecified';
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) textColor = figmaColorToCompose(solid.color);
      }
      return `${indent}Text(\n${indent}    text = "${text}",\n${indent}    fontSize = ${spVal(node.style?.fontSize)},\n${indent}    fontWeight = ${fontWeightCompose(node.style?.fontWeight)},\n${indent}    color = ${textColor}\n${indent})\n`;
    }

    // ─── Icon ───
    case 'Icon': {
      const iconName = sanitize(node.name).toLowerCase();
      const size = Math.round(node.width || 24);
      return `${indent}Icon(\n${indent}    painter = painterResource(id = R.drawable.${iconName}),\n${indent}    contentDescription = "${node.name}",\n${indent}    modifier = Modifier.size(${size}.dp)\n${indent})\n`;
    }

    // ─── Image ───
    case 'Image': {
      const imgName = sanitize(node.name).toLowerCase();
      return `${indent}Image(\n${indent}    painter = painterResource(id = R.drawable.${imgName}),\n${indent}    contentDescription = "${node.name}",\n${indent}    contentScale = ContentScale.Crop,\n${indent}    modifier = Modifier.size(width = ${Math.round(node.width || 100)}.dp, height = ${Math.round(node.height || 100)}.dp)\n${indent})\n`;
    }

    // ─── Divider ───
    case 'Divider':
      return `${indent}HorizontalDivider()\n`;

    // ─── Spacer ───
    case 'Spacer': {
      if (node.height && node.height > 0) {
        return `${indent}Spacer(modifier = Modifier.height(${Math.round(node.height)}.dp))\n`;
      }
      if (node.width && node.width > 0) {
        return `${indent}Spacer(modifier = Modifier.width(${Math.round(node.width)}.dp))\n`;
      }
      return `${indent}Spacer(modifier = Modifier.height(8.dp))\n`;
    }

    // ─── Button ───
    case 'Button': {
      // Find the text child for button label
      const textChild = node.children.find(c => c.semanticType === 'Text');
      const label = textChild?.text || node.name || 'Click';
      const hasIcon = node.children.some(c => c.semanticType === 'Icon');
      
      let bgColor = 'MaterialTheme.colorScheme.primary';
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) bgColor = figmaColorToCompose(solid.color);
      }

      if (hasIcon) {
        const iconChild = node.children.find(c => c.semanticType === 'Icon');
        const iconName = sanitize(iconChild?.name || 'icon').toLowerCase();
        return `${indent}Button(\n${indent}    onClick = { /* TODO */ },\n${indent}    shape = RoundedCornerShape(${Math.round(node.cornerRadius || 8)}.dp)\n${indent}) {\n${indent}    Icon(\n${indent}        painter = painterResource(id = R.drawable.${iconName}),\n${indent}        contentDescription = null,\n${indent}        modifier = Modifier.size(20.dp)\n${indent}    )\n${indent}    Spacer(modifier = Modifier.width(8.dp))\n${indent}    Text("${label.replace(/"/g, '\\"')}")\n${indent}}\n`;
      }

      return `${indent}Button(\n${indent}    onClick = { /* TODO */ },\n${indent}    shape = RoundedCornerShape(${Math.round(node.cornerRadius || 8)}.dp)\n${indent}) {\n${indent}    Text("${label.replace(/"/g, '\\"')}")\n${indent}}\n`;
    }

    // ─── Input / TextField ───
    case 'Input': {
      const placeholder = node.children.find(c => c.semanticType === 'Text')?.text || 'Enter text...';
      return `${indent}var textValue by remember { mutableStateOf("") }\n${indent}OutlinedTextField(\n${indent}    value = textValue,\n${indent}    onValueChange = { textValue = it },\n${indent}    placeholder = { Text("${placeholder.replace(/"/g, '\\"')}") },\n${indent}    shape = RoundedCornerShape(${Math.round(node.cornerRadius || 8)}.dp),\n${indent}    modifier = ${mod}\n${indent})\n`;
    }

    // ─── Card ───
    case 'Card': {
      let childrenCode = node.children.map(c => generateFromNode(c, next)).join('');
      return `${indent}Card(\n${indent}    shape = RoundedCornerShape(${Math.round(node.cornerRadius || 12)}.dp),\n${indent}    modifier = ${mod}\n${indent}) {\n${childrenCode}${indent}}\n`;
    }

    // ─── TopBar ───
    case 'TopBar': {
      const titleNode = node.children.find(c => c.semanticType === 'Text');
      const title = titleNode?.text || node.name;
      return `${indent}TopAppBar(\n${indent}    title = { Text("${title.replace(/"/g, '\\"')}") }\n${indent})\n`;
    }

    // ─── BottomBar ───
    case 'BottomBar': {
      let items = '';
      for (const child of node.children) {
        const label = child.children?.find(c => c.semanticType === 'Text')?.text || child.name;
        const iconNode = child.children?.find(c => c.semanticType === 'Icon');
        const iconName = sanitize(iconNode?.name || 'home').toLowerCase();
        items += `${next}NavigationBarItem(\n${next}    selected = false,\n${next}    onClick = { /* TODO */ },\n${next}    icon = { Icon(painterResource(id = R.drawable.${iconName}), contentDescription = null) },\n${next}    label = { Text("${(label || '').replace(/"/g, '\\"')}") }\n${next})\n`;
      }
      return `${indent}NavigationBar {\n${items}${indent}}\n`;
    }

    // ─── LazyColumn ───
    case 'LazyColumn': {
      // Find the repeating child pattern
      let childrenCode = '';
      if (node.children.length > 0) {
        // Generate a single "item" composable from the first child as template
        const templateChild = node.children[0];
        const templateCode = generateFromNode(templateChild, next + '    ');
        
        // Check if item is a reusable component
        const itemName = templateChild.isReusable ? sanitize(templateChild.name) + 'Item' : null;
        if (itemName) {
          extractedComponents.set(templateChild.reusableGroupId || templateChild.id, {
            name: itemName,
            node: templateChild
          });
        }

        childrenCode = `${next}items(${node.children.length}) { index ->\n${next}    // Template from: "${templateChild.name}"\n`;
        if (itemName) {
          childrenCode += `${next}    ${itemName}()\n`;
        } else {
          childrenCode += templateCode;
        }
        childrenCode += `${next}}\n`;
      }
      return `${indent}LazyColumn(\n${indent}    modifier = ${mod},\n${indent}    verticalArrangement = Arrangement.spacedBy(${dpVal(node.itemSpacing || 8)})\n${indent}) {\n${childrenCode}${indent}}\n`;
    }

    // ─── LazyRow ───
    case 'LazyRow': {
      let childrenCode = '';
      if (node.children.length > 0) {
        const templateChild = node.children[0];
        const templateCode = generateFromNode(templateChild, next + '    ');
        childrenCode = `${next}items(${node.children.length}) { index ->\n${templateCode}${next}}\n`;
      }
      return `${indent}LazyRow(\n${indent}    modifier = ${mod},\n${indent}    horizontalArrangement = Arrangement.spacedBy(${dpVal(node.itemSpacing || 8)})\n${indent}) {\n${childrenCode}${indent}}\n`;
    }

    // ─── Reusable Component → function call ───
    case 'Component': {
      const compName = sanitize(node.name);
      if (!extractedComponents.has(node.reusableGroupId || node.id)) {
        extractedComponents.set(node.reusableGroupId || node.id, { name: compName, node });
      }
      return `${indent}${compName}(modifier = ${mod})\n`;
    }

    // ─── Row ───
    case 'Row': {
      const childrenCode = node.children.map(c => generateFromNode(c, next)).join('');
      return `${indent}Row(\n${indent}    modifier = ${mod},\n${indent}    ${primaryArrangement(node, true)},\n${indent}    ${crossAlignment(node, true)}\n${indent}) {\n${childrenCode}${indent}}\n`;
    }

    // ─── Column ───
    case 'Column': {
      const childrenCode = node.children.map(c => generateFromNode(c, next)).join('');
      return `${indent}Column(\n${indent}    modifier = ${mod},\n${indent}    ${primaryArrangement(node, false)},\n${indent}    ${crossAlignment(node, false)}\n${indent}) {\n${childrenCode}${indent}}\n`;
    }

    // ─── Screen (root) ───
    case 'Screen': {
      const childrenCode = node.children.map(c => generateFromNode(c, next)).join('');
      return `${indent}Column(\n${indent}    modifier = Modifier.fillMaxSize()\n${indent}) {\n${childrenCode}${indent}}\n`;
    }

    // ─── New Material 3 Components ───

    case 'Chip': {
      const labelText = (node.text || node.name).replace(/"/g, '\\"');
      return `${indent}AssistChip(\n${indent}    onClick = {},\n${indent}    label = { Text("${labelText}") },\n${indent}    modifier = ${mod}\n${indent})\n`;
    }

    case 'Avatar':
      return `${indent}Image(\n${indent}    painter = painterResource(id = R.drawable.avatar),\n${indent}    contentDescription = "Avatar",\n${indent}    contentScale = ContentScale.Crop,\n${indent}    modifier = ${mod.replace('modifier', `Modifier.size(${Math.round(node.width || 40)}.dp).clip(CircleShape)`)}\n${indent})\n`;

    case 'Switch':
      return `${indent}Switch(\n${indent}    checked = true,\n${indent}    onCheckedChange = {},\n${indent}    modifier = ${mod}\n${indent})\n`;

    case 'Checkbox':
      return `${indent}Checkbox(\n${indent}    checked = false,\n${indent}    onCheckedChange = {},\n${indent}    modifier = ${mod}\n${indent})\n`;

    case 'FAB':
      return `${indent}FloatingActionButton(\n${indent}    onClick = {},\n${indent}    modifier = ${mod}\n${indent}) {\n${indent}    Icon(painterResource(id = R.drawable.ic_add), contentDescription = "Add")\n${indent}}\n`;

    case 'Badge': {
      const badgeText = (node.text || '1').replace(/"/g, '\\"');
      return `${indent}Badge(modifier = ${mod}) {\n${indent}    Text("${badgeText}")\n${indent}}\n`;
    }

    case 'ProgressBar':
      return `${indent}LinearProgressIndicator(\n${indent}    modifier = ${mod.replace('modifier', 'Modifier.fillMaxWidth()')},\n${indent}    progress = 0.5f\n${indent})\n`;

    case 'TabBar':
      return `${indent}TabRow(selectedTabIndex = 0, modifier = ${mod}) {\n${indent}    Tab(selected = true, onClick = {}, text = { Text("Tab 1") })\n${indent}    Tab(selected = false, onClick = {}, text = { Text("Tab 2") })\n${indent}}\n`;

    case 'Dropdown': {
      const dropdownText = (node.text || 'Select...').replace(/"/g, '\\"');
      return `${indent}ExposedDropdownMenuBox(expanded = false, onExpandedChange = {}) {\n${indent}    OutlinedTextField(\n${indent}        value = "${dropdownText}",\n${indent}        onValueChange = {},\n${indent}        readOnly = true,\n${indent}        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = false) },\n${indent}        modifier = ${mod.replace('modifier', 'Modifier.menuAnchor()')}\n${indent}    )\n${indent}}\n`;
    }

    case 'ListItem': {
      const title = node.children.find(c => c.semanticType === 'Text')?.text || 'Item';
      const titleText = title.replace(/"/g, '\\"');
      return `${indent}ListItem(\n${indent}    headlineContent = { Text("${titleText}") },\n${indent}    trailingContent = { Icon(painterResource(id = R.drawable.ic_chevron_right), contentDescription = null) },\n${indent}    modifier = ${mod}\n${indent})\n`;
    }

    // ─── Box (fallback) ───
    case 'Box':
    default: {
      const childrenCode = node.children.map(c => generateFromNode(c, next)).join('');
      return `${indent}Box(\n${indent}    modifier = ${mod}\n${indent}) {\n${childrenCode}${indent}}\n`;
    }
  }
}

/* ──────────── Full File Generator ──────────── */

export function generateSmartComposeFile(tree: UINode, screenName: string): string {
  extractedComponents.clear();

  const safeScreenName = sanitize(screenName) || 'FigmaScreen';
  const bodyCode = generateFromNode(tree, '        ');

  // Build extracted reusable component functions
  let reusableFunctions = '';
  for (const [, { name, node }] of extractedComponents) {
    const compCode = generateReusableBody(node, '        ');
    reusableFunctions += `
@Composable
fun ${name}(
    modifier: Modifier = Modifier
) {
${compCode}
}

`;
  }

  return `package com.example.figmaexport.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
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

/**
 * AI-Generated Composable from Figma Design
 *
 * Smart decisions made:
 * - Layout: Column/Row based on auto-layout analysis
 * - LazyColumn/LazyRow: detected from repeated child patterns
 * - Reusable components: extracted from duplicate structures
 * - Material3 widgets: Button, Card, TextField, TopAppBar, NavigationBar
 */

@Composable
fun ${safeScreenName}Screen(
    modifier: Modifier = Modifier
) {
    Scaffold(
        modifier = modifier
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
${bodyCode}
        }
    }
}

${reusableFunctions}
@Preview(showBackground = true, showSystemUi = true)
@Composable
private fun ${safeScreenName}ScreenPreview() {
    MaterialTheme {
        ${safeScreenName}Screen()
    }
}
`;
}

/* ── Generate body for reusable component (avoiding recursion into Component type) ── */

function generateReusableBody(node: UINode, indent: string): string {
  // Generate as if it's a Column/Row/Card, not a Component (to avoid infinite loop)
  const originalType = node.semanticType;
  const modifiedNode = { ...node, semanticType: (node.layoutMode === 'HORIZONTAL' ? 'Row' : 'Column') as SemanticType, isReusable: false };
  return generateFromNode(modifiedNode, indent);
}
