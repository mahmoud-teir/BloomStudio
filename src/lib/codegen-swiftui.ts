/**
 * SwiftUI Code Generator 🍎
 * Generates SwiftUI views from the semantic UINode tree.
 */

import { UINode } from './smart-parser';

function hex(n: number): string { return n.toString(16).toUpperCase().padStart(2, '0'); }

function figmaColorToSwift(color: { r: number; g: number; b: number; a: number }): string {
  if (!color) return '.clear';
  return `Color(red: ${(color.r).toFixed(3)}, green: ${(color.g).toFixed(3)}, blue: ${(color.b).toFixed(3)}, opacity: ${(color.a).toFixed(2)})`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _\-]/g, '').split(/[\s_\-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Component';
}

function generateNode(node: UINode, indent: string): string {
  const next = indent + '    ';

  switch (node.semanticType) {
    case 'Text': {
      const text = (node.text || '').replace(/"/g, '\\"');
      let code = `${indent}Text("${text}")`;
      if (node.style?.fontSize) code += `\n${indent}    .font(.system(size: ${Math.round(node.style.fontSize)}))`;
      if (node.style?.fontWeight && node.style.fontWeight >= 600) code += `\n${indent}    .fontWeight(.bold)`;
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) code += `\n${indent}    .foregroundColor(${figmaColorToSwift(solid.color)})`;
      }
      return code + '\n';
    }

    case 'Icon': {
      const iconName = sanitize(node.name).toLowerCase();
      return `${indent}Image("${iconName}")\n${indent}    .resizable()\n${indent}    .frame(width: ${Math.round(node.width || 24)}, height: ${Math.round(node.height || 24)})\n`;
    }

    case 'Image': {
      const imgName = sanitize(node.name).toLowerCase();
      return `${indent}Image("${imgName}")\n${indent}    .resizable()\n${indent}    .aspectRatio(contentMode: .fill)\n${indent}    .frame(width: ${Math.round(node.width || 100)}, height: ${Math.round(node.height || 100)})\n${indent}    .clipped()\n`;
    }

    case 'Divider':
      return `${indent}Divider()\n`;

    case 'Spacer':
      return node.height ? `${indent}Spacer().frame(height: ${Math.round(node.height)})\n` : `${indent}Spacer()\n`;

    case 'Button': {
      const textChild = node.children.find(c => c.semanticType === 'Text');
      const label = textChild?.text || node.name || 'Tap';
      let code = `${indent}Button(action: { /* TODO */ }) {\n${indent}    Text("${label.replace(/"/g, '\\"')}")\n`;
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) code += `${indent}        .foregroundColor(.white)\n`;
      }
      code += `${indent}}\n`;
      if (node.cornerRadius) code += `${indent}.cornerRadius(${Math.round(node.cornerRadius)})\n`;
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) code += `${indent}.background(${figmaColorToSwift(solid.color)})\n`;
      }
      return code;
    }

    case 'Input': {
      const placeholder = node.children.find(c => c.semanticType === 'Text')?.text || 'Enter text...';
      return `${indent}@State private var textValue = ""\n${indent}TextField("${placeholder.replace(/"/g, '\\"')}", text: $textValue)\n${indent}    .textFieldStyle(.roundedBorder)\n${indent}    .padding()\n`;
    }

    case 'Card': {
      const children = node.children.map(c => generateNode(c, next)).join('');
      let code = `${indent}VStack {\n${children}${indent}}\n`;
      if (node.cornerRadius) code += `${indent}.cornerRadius(${Math.round(node.cornerRadius)})\n`;
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) code += `${indent}.background(${figmaColorToSwift(solid.color)})\n`;
      }
      code += `${indent}.shadow(radius: 4)\n`;
      return code;
    }

    case 'TopBar': {
      const titleNode = node.children.find(c => c.semanticType === 'Text');
      return `${indent}.navigationTitle("${(titleNode?.text || node.name).replace(/"/g, '\\"')}")\n`;
    }

    case 'LazyColumn': {
      const template = node.children[0];
      const templateCode = template ? generateNode(template, next + '    ') : '';
      return `${indent}ScrollView {\n${next}LazyVStack(spacing: ${node.itemSpacing || 8}) {\n${next}    ForEach(0..<${node.children.length}, id: \\.self) { index in\n${templateCode}${next}    }\n${next}}\n${indent}}\n`;
    }

    case 'LazyRow': {
      const template = node.children[0];
      const templateCode = template ? generateNode(template, next + '    ') : '';
      return `${indent}ScrollView(.horizontal) {\n${next}LazyHStack(spacing: ${node.itemSpacing || 8}) {\n${next}    ForEach(0..<${node.children.length}, id: \\.self) { index in\n${templateCode}${next}    }\n${next}}\n${indent}}\n`;
    }

    case 'Row': {
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}HStack(spacing: ${node.itemSpacing || 0}) {\n${children}${indent}}\n`;
    }

    case 'Column': {
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}VStack(spacing: ${node.itemSpacing || 0}) {\n${children}${indent}}\n`;
    }

    case 'Chip': {
      const chipText = (node.text || node.name).replace(/"/g, '\\"');
      return `${indent}Text("${chipText}")\n${indent}    .padding(.horizontal, 12)\n${indent}    .padding(.vertical, 6)\n${indent}    .background(Color.gray.opacity(0.2))\n${indent}    .cornerRadius(20)\n`;
    }

    case 'Avatar':
      return `${indent}Image("avatar")\n${indent}    .resizable()\n${indent}    .frame(width: ${Math.round(node.width || 40)}, height: ${Math.round(node.height || 40)})\n${indent}    .clipShape(Circle())\n`;

    case 'Switch':
      return `${indent}Toggle("", isOn: .constant(true))\n${indent}    .labelsHidden()\n`;

    case 'Checkbox':
      return `${indent}Image(systemName: "square")\n${indent}    .foregroundColor(.gray)\n`;

    case 'FAB':
      return `${indent}Button(action: {}) {\n${indent}    Image(systemName: "plus")\n${indent}        .foregroundColor(.white)\n${indent}        .padding()\n${indent}        .background(Color.blue)\n${indent}        .clipShape(Circle())\n${indent}        .shadow(radius: 4)\n${indent}}\n`;

    case 'Badge': {
      const badgeText = (node.text || '1').replace(/"/g, '\\"');
      return `${indent}Text("${badgeText}")\n${indent}    .font(.caption2)\n${indent}    .padding(4)\n${indent}    .background(Color.red)\n${indent}    .foregroundColor(.white)\n${indent}    .clipShape(Circle())\n`;
    }

    case 'ProgressBar':
      return `${indent}ProgressView(value: 0.5)\n`;

    case 'TabBar':
      return `${indent}HStack {\n${indent}    Spacer()\n${indent}    VStack { Image(systemName: "house"); Text("Home").font(.caption) }\n${indent}    Spacer()\n${indent}    VStack { Image(systemName: "gear"); Text("Settings").font(.caption) }.foregroundColor(.gray)\n${indent}    Spacer()\n${indent}}\n${indent}.padding()\n${indent}.background(Color(UIColor.systemBackground))\n${indent}.shadow(radius: 2)\n`;

    case 'Dropdown': {
      const dropdownText = (node.text || 'Select...').replace(/"/g, '\\"');
      return `${indent}Menu("${dropdownText}") {\n${indent}    Button("Option 1", action: {})\n${indent}    Button("Option 2", action: {})\n${indent}}\n`;
    }

    case 'ListItem': {
      const title = node.children.find(c => c.semanticType === 'Text')?.text || 'Item';
      const titleText = title.replace(/"/g, '\\"');
      return `${indent}HStack {\n${indent}    Text("${titleText}")\n${indent}    Spacer()\n${indent}    Image(systemName: "chevron.right").foregroundColor(.gray)\n${indent}}\n${indent}.padding()\n`;
    }

    case 'Screen': {
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}VStack {\n${children}${indent}}\n`;
    }

    default: {
      const children = node.children.map(c => generateNode(c, next)).join('');
      return `${indent}ZStack {\n${children}${indent}}\n`;
    }
  }
}

export function generateSwiftUIFile(tree: UINode, screenName: string): string {
  const name = sanitize(screenName) || 'FigmaScreen';
  const body = generateNode(tree, '        ');

  return `import SwiftUI

struct ${name}View: View {
    var body: some View {
        NavigationView {
            ScrollView {
${body}
            }
            .navigationTitle("${name}")
        }
    }
}

#Preview {
    ${name}View()
}
`;
}
