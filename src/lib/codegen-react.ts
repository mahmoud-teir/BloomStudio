/**
 * Smart React/TSX Code Generator
 * Generates React components from the semantic UINode tree.
 * Uses proper semantic HTML elements and Tailwind-style inline styles.
 */

import { UINode } from './smart-parser';

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _\-]/g, '').split(/[\s_\-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Component';
}

function figmaColorToCss(color: { r: number; g: number; b: number; a: number }): string {
  if (!color) return 'transparent';
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a < 1) return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function buildStyle(node: UINode): Record<string, string | number> {
  const s: Record<string, string | number> = {};
  if (node.width) s.width = node.width;
  if (node.height) s.height = node.height;
  if (node.cornerRadius) s.borderRadius = node.cornerRadius;
  if (node.opacity !== undefined && node.opacity < 1) s.opacity = node.opacity;
  if (node.paddingTop) s.paddingTop = node.paddingTop;
  if (node.paddingBottom) s.paddingBottom = node.paddingBottom;
  if (node.paddingLeft) s.paddingLeft = node.paddingLeft;
  if (node.paddingRight) s.paddingRight = node.paddingRight;
  if (node.fills?.length) {
    const solid = node.fills.find((f: Record<string, unknown>) => f.type === 'SOLID' && f.visible !== false);
    if (solid?.color) s.backgroundColor = figmaColorToCss(solid.color as { r: number; g: number; b: number; a: number });
  }
  if (node.strokes?.length && node.strokeWeight) {
    const stroke = node.strokes.find((f: Record<string, unknown>) => f.type === 'SOLID' && f.visible !== false);
    if (stroke?.color) s.border = `${node.strokeWeight}px solid ${figmaColorToCss(stroke.color as { r: number; g: number; b: number; a: number })}`;
  }
  return s;
}

function styleToString(style: Record<string, string | number>, indent: string): string {
  const entries = Object.entries(style);
  if (entries.length === 0) return '{}';
  if (entries.length <= 3) return `{ ${entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`).join(', ')} }`;
  return `{\n${entries.map(([k, v]) => `${indent}  ${k}: ${typeof v === 'string' ? `'${v}'` : v},`).join('\n')}\n${indent}}`;
}

function generateNode(node: UINode, indent: string): string {
  const next = indent + '  ';

  switch (node.semanticType) {
    case 'Text': {
      const text = (node.text || '').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
      const textStyle: Record<string, string | number> = {};
      if (node.style?.fontSize) textStyle.fontSize = node.style.fontSize;
      if (node.style?.fontWeight) textStyle.fontWeight = node.style.fontWeight;
      if (node.style?.lineHeight) textStyle.lineHeight = `${node.style.lineHeight}px`;
      if (node.fills?.length) {
        const solid = node.fills.find((f: Record<string, unknown>) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) textStyle.color = figmaColorToCss(solid.color as { r: number; g: number; b: number; a: number });
      }
      const styleStr = Object.keys(textStyle).length > 0 ? ` style={${styleToString(textStyle, indent)}}` : '';
      if (text.includes('\n')) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        return `${indent}<p${styleStr}>\n${lines.map(l => `${next}${l}<br />`).join('\n')}\n${indent}</p>\n`;
      }
      return `${indent}<span${styleStr}>${text}</span>\n`;
    }

    case 'Icon': {
      const iconName = sanitize(node.name).toLowerCase();
      return `${indent}<img src="/icons/${iconName}.svg" alt="${node.name}" style={{ width: ${Math.round(node.width || 24)}, height: ${Math.round(node.height || 24)} }} />\n`;
    }

    case 'Image': {
      const imgName = sanitize(node.name).toLowerCase();
      return `${indent}<img src="/images/${imgName}.png" alt="${node.name}" style={{ width: ${Math.round(node.width || 100)}, height: ${Math.round(node.height || 100)}, objectFit: 'cover', borderRadius: ${node.cornerRadius || 0} }} />\n`;
    }

    case 'Divider':
      return `${indent}<hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.12)', margin: '8px 0' }} />\n`;

    case 'Spacer':
      return node.height
        ? `${indent}<div style={{ height: ${Math.round(node.height)} }} />\n`
        : `${indent}<div style={{ flex: 1 }} />\n`;

    case 'Button': {
      const textChild = node.children.find(c => c.semanticType === 'Text');
      const label = textChild?.text || node.name || 'Click';
      const style = buildStyle(node);
      style.cursor = 'pointer';
      style.display = 'flex';
      style.alignItems = 'center';
      style.justifyContent = 'center';
      if (node.itemSpacing) style.gap = node.itemSpacing;
      return `${indent}<button style={${styleToString(style, indent)}}>\n${next}${label}\n${indent}</button>\n`;
    }

    case 'Input': {
      const placeholder = node.children.find(c => c.semanticType === 'Text')?.text || 'Enter text...';
      const style = buildStyle(node);
      style.display = 'flex';
      return `${indent}<input placeholder="${placeholder.replace(/"/g, '&quot;')}" style={${styleToString(style, indent)}} />\n`;
    }

    case 'Card': {
      const style = buildStyle(node);
      style.display = 'flex';
      style.flexDirection = 'column';
      if (node.itemSpacing) style.gap = node.itemSpacing;
      style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<div style={${styleToString(style, indent)}}>\n${children}${indent}</div>\n`;
    }

    case 'TopBar': {
      const style = buildStyle(node);
      style.display = 'flex';
      style.alignItems = 'center';
      if (node.itemSpacing) style.gap = node.itemSpacing;
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<header style={${styleToString(style, indent)}}>\n${children}${indent}</header>\n`;
    }

    case 'BottomBar': {
      const style = buildStyle(node);
      style.display = 'flex';
      style.alignItems = 'center';
      style.justifyContent = 'space-around';
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<nav style={${styleToString(style, indent)}}>\n${children}${indent}</nav>\n`;
    }

    case 'LazyColumn': {
      const children = node.children.map((c, i) => {
        const child = generateNode(c, next + '  ');
        return `${next}<div key={${i}}>\n${child}${next}</div>`;
      }).join('\n');
      return `${indent}<div style={{ display: 'flex', flexDirection: 'column', gap: ${node.itemSpacing || 8}, overflowY: 'auto' }}>\n${children}\n${indent}</div>\n`;
    }

    case 'LazyRow': {
      const children = node.children.map((c, i) => {
        const child = generateNode(c, next + '  ');
        return `${next}<div key={${i}}>\n${child}${next}</div>`;
      }).join('\n');
      return `${indent}<div style={{ display: 'flex', flexDirection: 'row', gap: ${node.itemSpacing || 8}, overflowX: 'auto' }}>\n${children}\n${indent}</div>\n`;
    }

    case 'Row': {
      const style: Record<string, string | number> = { display: 'flex', flexDirection: 'row' };
      if (node.itemSpacing) style.gap = node.itemSpacing;
      if (node.counterAxisAlignItems === 'CENTER') style.alignItems = 'center';
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<div style={${styleToString(style, indent)}}>\n${children}${indent}</div>\n`;
    }

    case 'Column': {
      const style: Record<string, string | number> = { display: 'flex', flexDirection: 'column' };
      if (node.itemSpacing) style.gap = node.itemSpacing;
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<div style={${styleToString(style, indent)}}>\n${children}${indent}</div>\n`;
    }

    case 'Chip': {
      const chipText = node.text || node.name;
      return `${indent}<span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.08)', fontSize: 12 }}>${chipText}</span>\n`;
    }

    case 'Avatar':
      return `${indent}<img src="/images/avatar.png" alt="Avatar" style={{ width: ${Math.round(node.width || 40)}, height: ${Math.round(node.height || 40)}, borderRadius: '50%', objectFit: 'cover' }} />\n`;

    case 'Switch':
      return `${indent}<input type="checkbox" role="switch" />\n`;

    case 'Checkbox':
      return `${indent}<input type="checkbox" />\n`;

    case 'FAB':
      return `${indent}<button style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#6200EE', color: 'white', border: 'none', boxShadow: '0 4px 8px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: 24 }}>+</button>\n`;

    case 'Badge': {
      const badgeText = node.text || '1';
      return `${indent}<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: 10, backgroundColor: 'red', color: 'white', fontSize: 11, padding: '0 6px' }}>${badgeText}</span>\n`;
    }

    case 'ProgressBar':
      return `${indent}<progress value="50" max="100" style={{ width: '100%' }} />\n`;

    case 'TabBar': {
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<nav style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '8px 0' }}>\n${children}${indent}</nav>\n`;
    }

    case 'Dropdown': {
      const dropdownText = node.text || 'Select...';
      return `${indent}<select style={{ padding: '8px 12px', borderRadius: ${node.cornerRadius || 4} }}>\n${next}<option>${dropdownText}</option>\n${next}<option>Option 1</option>\n${next}<option>Option 2</option>\n${indent}</select>\n`;
    }

    case 'ListItem': {
      const title = node.children.find(c => c.semanticType === 'Text')?.text || 'Item';
      return `${indent}<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>\n${next}<span>${title}</span>\n${next}<span>&rsaquo;</span>\n${indent}</div>\n`;
    }

    case 'Screen': {
      const style = buildStyle(node);
      style.display = 'flex';
      style.flexDirection = 'column';
      style.minHeight = '100vh';
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}<div style={${styleToString(style, indent)}}>\n${children}${indent}</div>\n`;
    }

    default: {
      const style = buildStyle(node);
      style.position = 'relative';
      const children = node.children.map(c => generateNode(c, next)).join('');
      if (children) {
        return `${indent}<div style={${styleToString(style, indent)}}>\n${children}${indent}</div>\n`;
      }
      return `${indent}<div style={${styleToString(style, indent)}} />\n`;
    }
  }
}

export function generateSmartReactFile(tree: UINode, componentName: string): string {
  const name = sanitize(componentName) || 'FigmaComponent';
  const body = generateNode(tree, '      ');

  return `import React from 'react';

export interface ${name}Props {
  className?: string;
}

export const ${name}: React.FC<${name}Props> = ({ className }) => {
  return (
    <div className={className}>
${body}
    </div>
  );
};

export default ${name};
`;
}
