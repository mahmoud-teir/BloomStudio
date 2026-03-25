'use client';

import React from 'react';
import {
  Component, Palette, Type as TypeIcon, Ruler, Circle, BookOpen,
  Image as ImageIcon, Download, FileType, Search, Grid3X3, List,
} from 'lucide-react';
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

// Matches the actual shape returned by design-system.ts extractDesignSystem()
interface DesignColor {
  hex: string;
  name: string;
  count: number;
  opacity: number;
}

interface DesignFont {
  family: string;
  sizes: number[];
  weights: number[];
}

interface DesignSystem {
  colors: DesignColor[];
  fonts: DesignFont[];
  spacings: number[];
  radii: number[];
}

interface ExtractedAsset {
  id: string;
  name: string;
  originalName: string;
  category: 'icon' | 'image' | 'drawable';
  format: 'svg' | 'png';
  width: number;
  height: number;
  exportUrl?: string;
}

interface AssetStats {
  total: number;
  icons: number;
  images: number;
  drawables: number;
  uniqueNodes: number;
}

interface LibraryViewProps {
  uiTree: UINode | null;
  stats: { totalNodes: number; reusableCount: number; lazyListCount: number; typeBreakdown: Record<string, number> } | null;
  designSystem: DesignSystem | null;
  assets?: ExtractedAsset[];
  assetStats?: AssetStats | null;
  fileKey?: string;
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

export function LibraryView({ uiTree, stats, designSystem, assets = [], assetStats, fileKey }: LibraryViewProps) {
  const [activeSection, setActiveSection] = React.useState<'components' | 'types' | 'tokens' | 'assets'>('components');
  const [assetFilter, setAssetFilter] = React.useState<'all' | 'icon' | 'image'>('all');
  const [assetSearch, setAssetSearch] = React.useState('');
  const [assetViewMode, setAssetViewMode] = React.useState<'grid' | 'list'>('grid');
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = React.useState(false);

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

  // Deduplicate assets: only show icon + image (not drawable duplicates)
  const uniqueAssets = assets.filter(a => a.category !== 'drawable');
  const filteredAssets = uniqueAssets.filter(a => {
    if (assetFilter !== 'all' && a.category !== assetFilter) return false;
    if (assetSearch && !a.originalName.toLowerCase().includes(assetSearch.toLowerCase()) && !a.name.toLowerCase().includes(assetSearch.toLowerCase())) return false;
    return true;
  });

  const iconCount = uniqueAssets.filter(a => a.category === 'icon').length;
  const imageCount = uniqueAssets.filter(a => a.category === 'image').length;

  const sections = [
    { key: 'components' as const, label: 'Components', count: Object.keys(grouped).length },
    { key: 'types' as const, label: 'Types', count: Object.keys(typeBreakdown).length },
    { key: 'tokens' as const, label: 'Tokens', count: designSystem ? designSystem.colors.length + designSystem.fonts.length + designSystem.spacings.length + designSystem.radii.length : 0 },
    { key: 'assets' as const, label: 'Assets', count: uniqueAssets.length },
  ];

  const handleDownloadAsset = async (asset: ExtractedAsset) => {
    if (!asset.exportUrl) return;
    setDownloadingId(asset.id);
    try {
      const res = await fetch(asset.exportUrl);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${asset.name}.${asset.format}`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      console.error('Asset download failed:', e);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAllAssets = async () => {
    setDownloadingAll(true);
    try {
      const JSZip = (await import('jszip')).default;
      const { saveAs } = await import('file-saver');
      const zip = new JSZip();
      const iconsFolder = zip.folder('icons');
      const imagesFolder = zip.folder('images');

      const downloadable = uniqueAssets.filter(a => a.exportUrl);
      let downloaded = 0;

      for (const asset of downloadable) {
        try {
          const res = await fetch(asset.exportUrl!);
          if (!res.ok) continue;
          const blob = await res.blob();
          const folder = asset.category === 'icon' ? iconsFolder : imagesFolder;
          folder?.file(`${asset.name}.${asset.format}`, blob);
          downloaded++;
        } catch {
          // Skip failed assets
        }
      }

      if (downloaded > 0) {
        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, 'assets-export.zip');
      }
    } catch (e) {
      console.error('Asset ZIP generation failed:', e);
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-light">Library</h2>
        <p className="text-white/40 text-sm mt-1">
          {stats.reusableCount} reusable components &middot; {Object.keys(typeBreakdown).length} semantic types
          {uniqueAssets.length > 0 && <> &middot; {uniqueAssets.length} assets</>}
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
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

      {/* ═══════════ ASSETS TAB ═══════════ */}
      {activeSection === 'assets' && (
        <div className="space-y-4">
          {uniqueAssets.length === 0 ? (
            <div className="glass-card p-12 rounded-2xl text-center text-white/30">
              <ImageIcon className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No assets detected in the design</p>
              <p className="text-xs mt-1">Icons (≤48px), images (with IMAGE fills), and vector shapes are automatically extracted</p>
            </div>
          ) : (
            <>
              {/* Asset Stats Bar */}
              <div className="glass-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-cyan-400/30 border border-cyan-400/50" />
                    <span className="text-xs text-white/50">{iconCount} SVG Icons</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-purple-400/30 border border-purple-400/50" />
                    <span className="text-xs text-white/50">{imageCount} PNG Images</span>
                  </div>
                  {assetStats && (
                    <span className="text-xs text-white/30">{assetStats.uniqueNodes} unique nodes</span>
                  )}
                </div>
                {uniqueAssets.some(a => a.exportUrl) ? (
                  <button
                    onClick={handleDownloadAllAssets}
                    disabled={downloadingAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium gradient-primary text-obsidian-lowest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloadingAll ? 'Downloading...' : 'Download All Assets'}
                  </button>
                ) : (
                  <span className="text-[10px] text-yellow-400/60 px-3 py-1 rounded-lg bg-yellow-400/5 border border-yellow-400/10">
                    Preview URLs unavailable — try re-running the engine
                  </span>
                )}
              </div>

              {/* Filters + Search */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 glass-card rounded-lg px-1 py-1">
                  {(['all', 'icon', 'image'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setAssetFilter(f)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                        assetFilter === f ? 'bg-electric-blue/15 text-electric-blue' : 'text-white/40 hover:text-white'
                      )}
                    >
                      {f === 'all' ? `All (${uniqueAssets.length})` : f === 'icon' ? `Icons (${iconCount})` : `Images (${imageCount})`}
                    </button>
                  ))}
                </div>

                <div className="flex-1 min-w-[200px] glass-card rounded-lg flex items-center gap-2 px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-white/30" />
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={e => setAssetSearch(e.target.value)}
                    placeholder="Search assets..."
                    className="bg-transparent text-sm text-white flex-1 focus:outline-none placeholder:text-white/20"
                  />
                </div>

                <div className="flex items-center gap-1 glass-card rounded-lg px-1 py-1">
                  <button onClick={() => setAssetViewMode('grid')} className={cn('p-1.5 rounded-md transition-all', assetViewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white')}>
                    <Grid3X3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setAssetViewMode('list')} className={cn('p-1.5 rounded-md transition-all', assetViewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white')}>
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Assets Grid / List */}
              {filteredAssets.length === 0 ? (
                <div className="glass-card p-8 rounded-2xl text-center text-white/30">
                  <p className="text-sm">No assets match your filter</p>
                </div>
              ) : assetViewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredAssets.map((asset, i) => (
                    <div key={`${asset.id}-${asset.category}-${i}`} className="glass-card rounded-xl overflow-hidden group hover:border-electric-blue/30 transition-all">
                      {/* Preview */}
                      <div className="relative aspect-square bg-obsidian-bg/50 flex items-center justify-center p-4 overflow-hidden">
                        {asset.exportUrl ? (
                          <img
                            src={asset.exportUrl}
                            alt={asset.originalName}
                            className="max-w-full max-h-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={cn('flex flex-col items-center text-white/20', asset.exportUrl && 'hidden')}>
                          {asset.category === 'icon' ? <FileType className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
                          <span className="text-[9px] mt-1">{asset.width}x{asset.height}</span>
                        </div>

                        {/* Download overlay */}
                        {asset.exportUrl && (
                          <button
                            onClick={() => handleDownloadAsset(asset)}
                            disabled={downloadingId === asset.id}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Download className={cn('w-5 h-5 text-white', downloadingId === asset.id && 'animate-pulse')} />
                          </button>
                        )}

                        {/* Category badge */}
                        <span className={cn(
                          'absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase',
                          asset.category === 'icon' ? 'bg-cyan-400/15 text-cyan-400' : 'bg-purple-400/15 text-purple-400'
                        )}>
                          {asset.format}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <p className="text-xs font-medium truncate" title={asset.originalName}>{asset.originalName}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">{asset.width}x{asset.height}px</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* List view */
                <div className="glass-card rounded-2xl overflow-hidden divide-y divide-white/5">
                  {filteredAssets.map((asset, i) => (
                    <div key={`${asset.id}-${asset.category}-${i}`} className="flex items-center gap-4 p-3 hover:bg-white/[0.02] transition-colors">
                      {/* Thumbnail */}
                      <div className="w-10 h-10 rounded-lg bg-obsidian-bg/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {asset.exportUrl ? (
                          <img src={asset.exportUrl} alt={asset.originalName} className="max-w-full max-h-full object-contain" loading="lazy" />
                        ) : (
                          asset.category === 'icon' ? <FileType className="w-4 h-4 text-white/20" /> : <ImageIcon className="w-4 h-4 text-white/20" />
                        )}
                      </div>

                      {/* Name + details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{asset.originalName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={cn(
                            'text-[10px] font-bold uppercase',
                            asset.category === 'icon' ? 'text-cyan-400' : 'text-purple-400'
                          )}>
                            {asset.category}
                          </span>
                          <span className="text-[10px] text-white/30">{asset.width}x{asset.height}px</span>
                          <span className="text-[10px] text-white/30 font-mono">.{asset.format}</span>
                        </div>
                      </div>

                      {/* Download button */}
                      {asset.exportUrl && (
                        <button
                          onClick={() => handleDownloadAsset(asset)}
                          disabled={downloadingId === asset.id}
                          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <Download className={cn('w-4 h-4', downloadingId === asset.id && 'animate-pulse')} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

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
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Colors ({designSystem.colors.length})</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {designSystem.colors.slice(0, 24).map((color, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 rounded-lg border border-white/10 flex-shrink-0" style={{ backgroundColor: color.hex, opacity: color.opacity }} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-white/50 truncate">{color.name}</p>
                      <p className="text-xs font-mono text-white/60 truncate">{color.hex}</p>
                      <p className="text-[10px] text-white/30">{color.count}x used</p>
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
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Typography ({designSystem.fonts.length})</h3>
              </div>
              <div className="space-y-3">
                {designSystem.fonts.map((font, i) => (
                  <div key={i} className="p-4 rounded-lg bg-white/[0.03]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white/80" style={{ fontFamily: font.family }}>{font.family}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-[10px] text-white/30 uppercase tracking-wider">Sizes:</span>
                      {font.sizes.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/50 font-mono">{s}px</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] text-white/30 uppercase tracking-wider">Weights:</span>
                      {font.weights.map(w => (
                        <span key={w} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/50 font-mono">{w}</span>
                      ))}
                    </div>
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
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Spacing ({designSystem.spacings.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {designSystem.spacings.map((value, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
                    <div className="bg-electric-blue/20 rounded" style={{ width: Math.min(value, 48), height: 8 }} />
                    <span className="text-xs font-mono text-white/50">{value}px</span>
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
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Border Radii ({designSystem.radii.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {designSystem.radii.map((value, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03]">
                    <div className="w-6 h-6 border border-electric-blue/30 bg-electric-blue/5" style={{ borderRadius: value }} />
                    <span className="text-xs font-mono text-white/50">{value}px</span>
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
