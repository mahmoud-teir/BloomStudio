'use client';

import React from 'react';
import { Component, Palette, Type as TypeIcon, Ruler, Circle, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UINode {
  id: string;
  name: string;
  semanticType: string;
  isReusable?: boolean;
  reusableGroupId?: string;
  children: UINode[];
  width?: number;
  height?: number;
}

interface DesignToken {
  name: string;
  value: string;
  count: number;
}

interface DesignSystem {
  colors: DesignToken[];
  fonts: DesignToken[];
  spacings: DesignToken[];
  radii: DesignToken[];
}

interface LibraryViewProps {
  uiTree: UINode | null;
  stats: { totalNodes: number; reusableCount: number; lazyListCount: number; typeBreakdown: Record<string, number> } | null;
  designSystem: DesignSystem | null;
}

function collectReusable(node: UINode, result: UINode[] = []): UINode[] {
  if (node.isReusable) result.push(node);
  for (const c of node.children) collectReusable(c, result);
  return result;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (map[k] ||= []).push(item);
  }
  return map;
}

export function LibraryView({ uiTree, stats, designSystem }: LibraryViewProps) {
  const [activeSection, setActiveSection] = React.useState<'components' | 'types' | 'tokens'>('components');

  if (!uiTree || !stats) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-light mb-2">Library</h2>
        <p className="text-white/40 mb-8">Run the engine first to see the component library.</p>
        <div className="glass-card p-16 rounded-2xl flex flex-col items-center justify-center text-white/20">
          <BookOpen className="w-12 h-12 mb-4 opacity-50" />
          <p>No library data available</p>
        </div>
      </div>
    );
  }

  const reusable = collectReusable(uiTree);
  const grouped = groupBy(reusable, n => n.reusableGroupId || n.id);
  const typeBreakdown = stats.typeBreakdown;
  const maxTypeCount = Math.max(...Object.values(typeBreakdown), 1);

  const sections = [
    { key: 'components' as const, label: 'Reusable Components', count: Object.keys(grouped).length },
    { key: 'types' as const, label: 'Type Breakdown', count: Object.keys(typeBreakdown).length },
    { key: 'tokens' as const, label: 'Design Tokens', count: designSystem ? designSystem.colors.length + designSystem.fonts.length : 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-light">Library</h2>
        <p className="text-white/40 text-sm mt-1">
          {stats.reusableCount} reusable components &middot; {Object.keys(typeBreakdown).length} semantic types
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-6">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
              activeSection === s.key
                ? 'bg-electric-blue/10 text-electric-blue border border-electric-blue/20'
                : 'text-white/40 hover:text-white hover:bg-white/5'
            )}
          >
            {s.label}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/5">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Reusable Components */}
      {activeSection === 'components' && (
        <div className="space-y-3">
          {Object.keys(grouped).length === 0 ? (
            <div className="glass-card p-12 rounded-2xl text-center text-white/30">
              <Component className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No reusable components detected</p>
              <p className="text-xs mt-1">Components that appear 2+ times with identical structure are marked reusable</p>
            </div>
          ) : (
            Object.entries(grouped).map(([groupId, nodes]) => (
              <div key={groupId} className="glass-card rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-electric-blue/10">
                      <Component className="w-4 h-4 text-electric-blue" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{nodes[0].name}</p>
                      <p className="text-xs text-white/40">{nodes[0].semanticType} &middot; {nodes[0].width && nodes[0].height ? `${Math.round(nodes[0].width)}x${Math.round(nodes[0].height)}` : 'auto'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-electric-blue/10 text-electric-blue">
                      {nodes.length}x used
                    </span>
                  </div>
                </div>
                {nodes[0].children.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Children</p>
                    <div className="flex flex-wrap gap-1">
                      {nodes[0].children.slice(0, 8).map((c, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/50">
                          {c.semanticType}: {c.name}
                        </span>
                      ))}
                      {nodes[0].children.length > 8 && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/30">
                          +{nodes[0].children.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Type Breakdown */}
      {activeSection === 'types' && (
        <div className="glass-card rounded-2xl p-6">
          <div className="space-y-3">
            {Object.entries(typeBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-sm text-white/70 w-28 text-right truncate">{type}</span>
                  <div className="flex-1 h-6 bg-white/5 rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-electric-blue/30 to-deep-violet/30 transition-all duration-500"
                      style={{ width: `${(count / maxTypeCount) * 100}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-3 text-xs text-white/60">{count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Design Tokens */}
      {activeSection === 'tokens' && designSystem && (
        <div className="space-y-6">
          {/* Colors */}
          {designSystem.colors.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Colors</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {designSystem.colors.slice(0, 20).map((token, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 rounded-lg border border-white/10 flex-shrink-0" style={{ backgroundColor: token.value }} />
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-white/60 truncate">{token.value}</p>
                      <p className="text-[10px] text-white/30">{token.count}x used</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fonts */}
          {designSystem.fonts.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TypeIcon className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Typography</h3>
              </div>
              <div className="space-y-2">
                {designSystem.fonts.map((token, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03]">
                    <span className="text-sm text-white/70" style={{ fontFamily: token.name }}>{token.name} — {token.value}</span>
                    <span className="text-[10px] text-white/30">{token.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spacing */}
          {designSystem.spacings.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Ruler className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Spacing</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {designSystem.spacings.map((token, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
                    <div className="bg-electric-blue/20 rounded" style={{ width: Math.min(Number(token.value) || 8, 48), height: 8 }} />
                    <span className="text-xs font-mono text-white/50">{token.value}px</span>
                    <span className="text-[10px] text-white/20">{token.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Radii */}
          {designSystem.radii.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Circle className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Border Radii</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {designSystem.radii.map((token, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
                    <div className="w-6 h-6 border border-electric-blue/30 bg-electric-blue/5" style={{ borderRadius: Number(token.value) || 0 }} />
                    <span className="text-xs font-mono text-white/50">{token.value}px</span>
                    <span className="text-[10px] text-white/20">{token.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!designSystem.colors.length && !designSystem.fonts.length) && (
            <div className="glass-card p-12 rounded-2xl text-center text-white/30">
              <Palette className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No design tokens extracted</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
