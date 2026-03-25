'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Cpu, Layers, Zap, Globe, ZoomIn, ZoomOut, Maximize2, Code } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DesktopViewProps {
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  onGenerate: () => void;
  stats: any;
  latency: number;
  previewImageUrl: string;
  codeData: any;
  error: string;
}

export function DesktopView({
  url, setUrl, loading, onGenerate, stats, latency, previewImageUrl, codeData, error,
}: DesktopViewProps) {
  const [zoom, setZoom] = React.useState(1);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-display-lg"
        >
          The Obsidian <span className="text-white/20">Synthesis</span>
        </motion.h1>
        <p className="text-white/40 mt-2 max-w-lg">
          Connect your Figma designs directly. The Engine analyzes Auto Layout, identifies semantic components, and generates production-ready code.
        </p>
      </header>

      {/* Input Module */}
      <div className="glass-card p-6 rounded-2xl mb-12 flex gap-4 items-center">
        <Globe className="w-6 h-6 text-white/40 ml-2" />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste Figma File URL here..."
          className="flex-1 bg-transparent text-white focus:outline-none placeholder:text-white/20 font-mono text-sm"
        />
        <button
          onClick={onGenerate}
          disabled={loading || !url}
          className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <Zap className="w-4 h-4 text-electric-blue" />
          {loading ? 'Processing...' : 'Run Engine'}
        </button>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-mono">
          Error: {error}
        </div>
      )}

      {/* Preview Image */}
      {previewImageUrl && (
        <div className="glass-card rounded-2xl mb-12 overflow-hidden">
          <div className="h-10 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
            <span className="text-xs font-medium text-white/40">Design Preview</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-white/30 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(1)} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-auto bg-obsidian-bg/50 flex items-center justify-center p-8" style={{ maxHeight: 400 }}>
            <img
              src={previewImageUrl}
              alt="Figma Design Preview"
              className="transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            />
          </div>
        </div>
      )}

      {/* Grid Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <ModuleCard
          title="Total Nodes Analyzed"
          value={stats?.totalNodes || '0'}
          trend={stats ? 'Processed' : '-'}
          icon={<Cpu className="w-5 h-5 text-electric-blue" />}
          color="bg-electric-blue/10"
        />
        <ModuleCard
          title="Reusable Elements / Lists"
          value={stats ? `${stats.reusableCount} / ${stats.lazyListCount}` : '0 / 0'}
          trend={stats ? 'Detected' : '-'}
          icon={<Layers className="w-5 h-5 text-deep-violet" />}
          color="bg-deep-violet/10"
        />
        <ModuleCard
          title="Engine Latency"
          value={`${latency}ms`}
          trend={latency < 1000 ? 'Fast' : 'Average'}
          icon={<Zap className="w-5 h-5 text-on-surface" />}
          color="bg-white/5"
        />
      </div>

      {/* Quick Code Preview */}
      {codeData && (
        <div className="mt-12 glass-card rounded-2xl overflow-hidden flex flex-col h-[300px]">
          <div className="h-10 px-4 flex items-center border-b border-white/5 bg-white/5">
            <Code className="w-4 h-4 text-white/30 mr-2" />
            <span className="text-xs font-medium text-white/30">Quick Preview — switch to Code Preview for full editor</span>
          </div>
          <div className="flex-1 bg-obsidian-bg p-4 overflow-auto font-mono text-xs text-white/60">
            <pre className="whitespace-pre-wrap"><code>{codeData.react?.slice(0, 500)}...</code></pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleCard({ title, value, trend, icon, color }: { title: string; value: string; trend: string; icon: React.ReactNode; color: string }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="glass-card p-6 rounded-2xl group cursor-default"
    >
      <div className="flex justify-between items-start mb-6">
        <div className={cn('p-3 rounded-lg', color)}>
          {icon}
        </div>
        <div className={cn(
          'text-[10px] font-bold px-2 py-1 rounded-full',
          trend.startsWith('+') ? 'text-green-400 bg-green-400/10' : 'text-electric-blue bg-electric-blue/10'
        )}>
          {trend}
        </div>
      </div>
      <div>
        <p className="text-label-sm text-white/30 mb-1">{title}</p>
        <p className="text-3xl font-light tracking-tight">{value}</p>
      </div>
    </motion.div>
  );
}
