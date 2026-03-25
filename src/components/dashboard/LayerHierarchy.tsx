'use client';

import React from 'react';
import {
  ChevronRight, ChevronDown, Search,
  Monitor, ArrowDown, ArrowRight, Type, MousePointer,
  Square, ImageIcon, Sparkles, TextCursorInput, Minus,
  ToggleRight, CheckSquare, Star, CircleDot, BarChart3,
  PanelTop, PanelBottom, List, Component, Columns,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UINode {
  id: string;
  name: string;
  semanticType: string;
  figmaType: string;
  aiReason?: string;
  isReusable?: boolean;
  reusableGroupId?: string;
  text?: string;
  children: UINode[];
  width?: number;
  height?: number;
  componentConfidence?: number;
}

interface LayerHierarchyProps {
  uiTree: UINode | null;
}

const SEMANTIC_ICONS: Record<string, React.ElementType> = {
  Screen: Monitor, Column: ArrowDown, Row: ArrowRight, LazyColumn: List, LazyRow: Columns,
  Box: Square, Card: Square, Button: MousePointer, Text: Type, Image: ImageIcon,
  Icon: Sparkles, Input: TextCursorInput, Divider: Minus, Spacer: Minus,
  TopBar: PanelTop, BottomBar: PanelBottom, ListItem: List, Component: Component,
  Avatar: CircleDot, Chip: Star, Switch: ToggleRight, Checkbox: CheckSquare,
  FAB: MousePointer, Badge: Star, ProgressBar: BarChart3, TabBar: PanelTop, Dropdown: List,
};

const SEMANTIC_COLORS: Record<string, string> = {
  Screen: 'text-white/50', Column: 'text-blue-400', Row: 'text-green-400',
  LazyColumn: 'text-cyan-400', LazyRow: 'text-cyan-400', Box: 'text-white/40',
  Card: 'text-violet-400', Button: 'text-electric-blue', Text: 'text-white/70',
  Image: 'text-pink-400', Icon: 'text-yellow-400', Input: 'text-orange-400',
  Divider: 'text-white/30', Spacer: 'text-white/20', TopBar: 'text-indigo-400',
  BottomBar: 'text-indigo-400', ListItem: 'text-teal-400', Component: 'text-electric-blue',
  Avatar: 'text-pink-300', Chip: 'text-amber-400', Switch: 'text-green-300',
  Checkbox: 'text-green-300', FAB: 'text-electric-blue', Badge: 'text-red-400',
  ProgressBar: 'text-blue-300', TabBar: 'text-indigo-300', Dropdown: 'text-orange-300',
};

function countNodes(node: UINode): number {
  let c = 1;
  for (const child of node.children) c += countNodes(child);
  return c;
}

function matchesSearch(node: UINode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  if (node.semanticType.toLowerCase().includes(q)) return true;
  if (node.text?.toLowerCase().includes(q)) return true;
  return node.children.some(c => matchesSearch(c, q));
}

export function LayerHierarchy({ uiTree }: LayerHierarchyProps) {
  const [search, setSearch] = React.useState('');
  const total = uiTree ? countNodes(uiTree) : 0;

  if (!uiTree) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-light mb-2">Layer Hierarchy</h2>
        <p className="text-white/40 mb-8">Run the engine first to see the layer tree.</p>
        <div className="glass-card p-16 rounded-2xl flex flex-col items-center justify-center text-white/20">
          <List className="w-12 h-12 mb-4 opacity-50" />
          <p>No tree data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light">Layer Hierarchy</h2>
          <p className="text-white/40 text-sm mt-1">{total} nodes in tree</p>
        </div>
      </div>

      {/* Search */}
      <div className="glass-card rounded-xl mb-6 flex items-center gap-3 px-4 py-3">
        <Search className="w-4 h-4 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter nodes by name or type..."
          className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-white/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-white/30 hover:text-white text-xs">Clear</button>
        )}
      </div>

      {/* Tree */}
      <div className="glass-card rounded-2xl p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <TreeNode node={uiTree} depth={0} search={search} />
      </div>
    </div>
  );
}

function TreeNode({ node, depth, search }: { node: UINode; depth: number; search: string }) {
  const [expanded, setExpanded] = React.useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const Icon = SEMANTIC_ICONS[node.semanticType] || Square;
  const color = SEMANTIC_COLORS[node.semanticType] || 'text-white/40';

  if (search && !matchesSearch(node, search)) return null;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded-md hover:bg-white/5 cursor-pointer transition-colors group',
          depth === 0 && 'bg-white/[0.03]'
        )}
        style={{ paddingLeft: depth * 20 + 8 }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Collapse arrow */}
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3 h-3 text-white/30" /> : <ChevronRight className="w-3 h-3 text-white/30" />
          ) : (
            <div className="w-1 h-1 rounded-full bg-white/10" />
          )}
        </div>

        {/* Icon */}
        <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', color)} />

        {/* Name */}
        <span className="text-sm text-white/80 truncate">{node.name || node.semanticType}</span>

        {/* Semantic type badge */}
        <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 flex-shrink-0', color)}>
          {node.semanticType}
        </span>

        {/* Reusable badge */}
        {node.isReusable && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-electric-blue/10 text-electric-blue flex-shrink-0">
            REUSE
          </span>
        )}

        {/* Dimensions */}
        {node.width != null && node.height != null && (
          <span className="text-[10px] text-white/20 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {Math.round(node.width)}x{Math.round(node.height)}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode key={child.id || i} node={child} depth={depth + 1} search={search} />
          ))}
        </div>
      )}
    </div>
  );
}
