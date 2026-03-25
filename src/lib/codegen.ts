import { FigmaNode, extractStyles } from './parser';

function styleObjectToCssString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${cssKey}: ${value};`;
    })
    .join(' ');
}

function styleObjectToReactString(styles: Record<string, string>): string {
  return JSON.stringify(styles);
}

function escapeReactText(text: string) {
  return text.replace(/{/g, '&#123;').replace(/}/g, '&#125;');
}

export function generateHtml(node: FigmaNode, indent = '', assetMap: Record<string, string> = {}): string {
  if (node.visible === false) return '';

  const styles = extractStyles(node);
  const styleString = styleObjectToCssString(styles);

  const isImageContainer = node.name.toLowerCase().startsWith('image') ||
                           (node.fills?.some(f => f.type === 'IMAGE'));
  const isIcon = (node.absoluteBoundingBox?.width || 0) <= 64 && node.name.toLowerCase().includes('icon');

  if (isImageContainer || isIcon) {
    const src = assetMap[node.id] || `/assets/${node.name.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase()}.${isIcon ? 'svg' : 'png'}`;
    return `${indent}<img src="${src}" alt="${node.name}" style="${styleString}" />\n`;
  }

  if (node.type === 'TEXT') {
    return `${indent}<span style="${styleString}">${node.characters?.replace(/\n/g, '<br/>') || ''}</span>\n`;
  }

  let html = `${indent}<div style="${styleString}" class="figma-${node.type.toLowerCase()}">\n`;
  if (node.children) {
    for (const child of node.children) {
      html += generateHtml(child, indent + '  ', assetMap);
    }
  }
  html += `${indent}</div>\n`;
  return html;
}

export function generateReact(node: FigmaNode, indent = '', assetMap: Record<string, string> = {}): string {
  if (node.visible === false) return '';

  const styles = extractStyles(node);
  const styleString = styleObjectToReactString(styles);

  const isImageContainer = node.name.toLowerCase().startsWith('image') ||
                           (node.fills?.some(f => f.type === 'IMAGE'));
  const isIcon = (node.absoluteBoundingBox?.width || 0) <= 64 && node.name.toLowerCase().includes('icon');

  if (isImageContainer || isIcon) {
    const src = assetMap[node.id] || `/assets/${node.name.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase()}.${isIcon ? 'svg' : 'png'}`;
    return `${indent}<img src="${src}" alt="${node.name}" style={${styleString}} />\n`;
  }

  if (node.type === 'TEXT') {
    let textBody = node.characters || '';
    if (textBody.includes('\n')) {
        // Multi-line text mapping
        const lines = textBody.split('\n');
        textBody = lines.map(l => escapeReactText(l)).join('<br/>\n' + indent + '  ');
    } else {
        textBody = escapeReactText(textBody);
    }
    return `${indent}<span style={${styleString}}>\n${indent}  ${textBody}\n${indent}</span>\n`;
  }

  let jsx = `${indent}<div style={${styleString}} className="figma-${node.type.toLowerCase()}">\n`;
  if (node.children) {
    for (const child of node.children) {
      jsx += generateReact(child, indent + '  ', assetMap);
    }
  }
  jsx += `${indent}</div>\n`;
  return jsx;
}

export function generateReactComponent(node: FigmaNode, componentName: string, assetMap: Record<string, string> = {}): string {
  const innerJsx = generateReact(node, '      ', assetMap);
  return `import React from 'react';

export interface ${componentName}Props {
  className?: string;
}

export const ${componentName}: React.FC<${componentName}Props> = ({ className }) => {
  return (
    <div className={className}>
${innerJsx}
    </div>
  );
};

export default ${componentName};
`;
}
