/**
 * Flutter/Dart Code Generator 🐦
 * Generates Flutter Widget trees from the semantic UINode tree.
 */

import { UINode } from './smart-parser';

function figmaColorToFlutter(color: { r: number; g: number; b: number; a: number }): string {
  if (!color) return 'Colors.transparent';
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  const a = Math.round(color.a * 255).toString(16).padStart(2, '0');
  return `Color(0x${a}${r}${g}${b})`.toUpperCase();
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _\-]/g, '').split(/[\s_\-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Component';
}

function generateNode(node: UINode, indent: string): string {
  const next = indent + '  ';

  switch (node.semanticType) {
    case 'Text': {
      const text = (node.text || '').replace(/'/g, "\\'");
      let style = '';
      const parts: string[] = [];
      if (node.style?.fontSize) parts.push(`fontSize: ${Math.round(node.style.fontSize)}`);
      if (node.style?.fontWeight && node.style.fontWeight >= 600) parts.push('fontWeight: FontWeight.bold');
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) parts.push(`color: ${figmaColorToFlutter(solid.color)}`);
      }
      if (parts.length > 0) style = `,\n${indent}  style: TextStyle(${parts.join(', ')})`;
      return `${indent}Text(\n${indent}  '${text}'${style},\n${indent}),\n`;
    }

    case 'Icon': {
      const iconName = sanitize(node.name).toLowerCase();
      return `${indent}Image.asset(\n${indent}  'assets/${iconName}.svg',\n${indent}  width: ${Math.round(node.width || 24)},\n${indent}  height: ${Math.round(node.height || 24)},\n${indent}),\n`;
    }

    case 'Image': {
      const imgName = sanitize(node.name).toLowerCase();
      return `${indent}Image.asset(\n${indent}  'assets/${imgName}.png',\n${indent}  width: ${Math.round(node.width || 100)},\n${indent}  height: ${Math.round(node.height || 100)},\n${indent}  fit: BoxFit.cover,\n${indent}),\n`;
    }

    case 'Divider':
      return `${indent}const Divider(),\n`;

    case 'Spacer':
      return node.height
        ? `${indent}SizedBox(height: ${Math.round(node.height)}),\n`
        : `${indent}const Spacer(),\n`;

    case 'Button': {
      const textChild = node.children.find(c => c.semanticType === 'Text');
      const label = (textChild?.text || node.name || 'Tap').replace(/'/g, "\\'");
      let bgColor = '';
      if (node.fills?.length) {
        const solid = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false);
        if (solid?.color) bgColor = `\n${next}  style: ElevatedButton.styleFrom(\n${next}    backgroundColor: ${figmaColorToFlutter(solid.color)},\n${next}    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(${Math.round(node.cornerRadius || 8)})),\n${next}  ),`;
      }
      return `${indent}ElevatedButton(\n${next}onPressed: () { /* TODO */ },${bgColor}\n${next}child: Text('${label}'),\n${indent}),\n`;
    }

    case 'Input': {
      const placeholder = (node.children.find(c => c.semanticType === 'Text')?.text || 'Enter text...').replace(/'/g, "\\'");
      return `${indent}TextField(\n${next}decoration: InputDecoration(\n${next}  hintText: '${placeholder}',\n${next}  border: OutlineInputBorder(\n${next}    borderRadius: BorderRadius.circular(${Math.round(node.cornerRadius || 8)}),\n${next}  ),\n${next}),\n${indent}),\n`;
    }

    case 'Card': {
      const children = node.children.map(c => generateNode(c, next + '  ')).join('');
      return `${indent}Card(\n${next}shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(${Math.round(node.cornerRadius || 12)})),\n${next}child: Column(\n${next}  children: [\n${children}${next}  ],\n${next}),\n${indent}),\n`;
    }

    case 'TopBar':
      return ''; // handled at Scaffold level

    case 'LazyColumn': {
      const template = node.children[0];
      const templateCode = template ? generateNode(template, next + '      ') : '';
      return `${indent}ListView.builder(\n${next}itemCount: ${node.children.length},\n${next}itemBuilder: (context, index) {\n${next}  return Padding(\n${next}    padding: EdgeInsets.only(bottom: ${node.itemSpacing || 8}),\n${next}    child: ${templateCode.trim()}\n${next}  );\n${next}},\n${indent}),\n`;
    }

    case 'LazyRow': {
      const template = node.children[0];
      const templateCode = template ? generateNode(template, next + '        ') : '';
      return `${indent}SizedBox(\n${next}height: ${Math.round(node.height || 100)},\n${next}child: ListView.builder(\n${next}  scrollDirection: Axis.horizontal,\n${next}  itemCount: ${node.children.length},\n${next}  itemBuilder: (context, index) {\n${next}    return Padding(\n${next}      padding: EdgeInsets.only(right: ${node.itemSpacing || 8}),\n${next}      child: ${templateCode.trim()}\n${next}    );\n${next}  },\n${next}),\n${indent}),\n`;
    }

    case 'Row': {
      const children = node.children.map(c => generateNode(c, next + '  ')).join('');
      return `${indent}Row(\n${next}mainAxisAlignment: MainAxisAlignment.start,\n${next}children: [\n${children}${next}],\n${indent}),\n`;
    }

    case 'Column': {
      const children = node.children.map(c => generateNode(c, next + '  ')).join('');
      return `${indent}Column(\n${next}crossAxisAlignment: CrossAxisAlignment.start,\n${next}children: [\n${children}${next}],\n${indent}),\n`;
    }

    case 'Chip':
      return `${indent}Chip(label: Text('${(node.text || node.name).replace(/'/g, "\\'")}')),\n`;

    case 'Avatar':
      return `${indent}CircleAvatar(\n${next}radius: ${Math.round((node.width || 40) / 2)},\n${next}backgroundImage: const AssetImage('assets/avatar.png'),\n${indent}),\n`;

    case 'Switch':
      return `${indent}Switch(\n${next}value: true,\n${next}onChanged: (val) {},\n${indent}),\n`;

    case 'Checkbox':
      return `${indent}Checkbox(\n${next}value: false,\n${next}onChanged: (val) {},\n${indent}),\n`;

    case 'FAB':
      return `${indent}FloatingActionButton(\n${next}onPressed: () {},\n${next}child: const Icon(Icons.add),\n${indent}),\n`;

    case 'Badge':
      return `${indent}Badge(\n${next}label: Text('${(node.text || '1').replace(/'/g, "\\'")}')),\n${indent}),\n`;

    case 'ProgressBar':
      return `${indent}LinearProgressIndicator(value: 0.5),\n`;

    case 'TabBar':
      return `${indent}TabBar(\n${next}tabs: [\n${next}  Tab(text: 'Tab 1'),\n${next}  Tab(text: 'Tab 2'),\n${next}],\n${indent}),\n`;

    case 'Dropdown':
      return `${indent}DropdownButton<String>(\n${next}items: [],\n${next}onChanged: (val) {},\n${next}hint: Text('${(node.text || 'Select...').replace(/'/g, "\\'")}'),\n${indent}),\n`;

    case 'ListItem': {
      const title = node.children.find(c => c.semanticType === 'Text')?.text || 'Item';
      return `${indent}ListTile(\n${next}title: Text('${title.replace(/'/g, "\\'")}'),\n${next}trailing: const Icon(Icons.chevron_right),\n${indent}),\n`;
    }

    case 'Screen': {
      const children = node.children.map(c => generateNode(c, next + '  ')).join('');
      return `${indent}Column(\n${next}children: [\n${children}${next}],\n${indent}),\n`;
    }

    default: {
      const children = node.children.map(c => generateNode(c, next + '  ')).join('');
      return `${indent}Stack(\n${next}children: [\n${children}${next}],\n${indent}),\n`;
    }
  }
}

export function generateFlutterFile(tree: UINode, screenName: string): string {
  const name = sanitize(screenName) || 'FigmaScreen';
  const body = generateNode(tree, '          ');
  const topBar = tree.children.find(c => c.semanticType === 'TopBar');
  const title = topBar?.children?.find(c => c.semanticType === 'Text')?.text || name;

  return `import 'package:flutter/material.dart';

class ${name}Screen extends StatelessWidget {
  const ${name}Screen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${title.replace(/'/g, "\\'")}'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
${body}
          ],
        ),
      ),
    );
  }
}
`;
}
