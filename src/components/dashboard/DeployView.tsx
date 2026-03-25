'use client';

import React from 'react';
import {
  Download, Copy, Check, FileCode, Package,
  FileType, Smartphone, Globe, Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface DeployViewProps {
  codeData: { react: string; swiftui: string; compose: string; flutter: string } | null;
  componentName: string;
  assets?: ExtractedAsset[];
  fileKey?: string;
}

interface ExportTarget {
  key: 'react' | 'swiftui' | 'compose' | 'flutter';
  label: string;
  ext: string;
  icon: React.ElementType;
  color: string;
  description: string;
}

const TARGETS: ExportTarget[] = [
  { key: 'react', label: 'React', ext: '.tsx', icon: Globe, color: 'text-cyan-400', description: 'React component with Tailwind CSS' },
  { key: 'swiftui', label: 'SwiftUI', ext: '.swift', icon: Smartphone, color: 'text-orange-400', description: 'Native iOS/macOS view' },
  { key: 'compose', label: 'Compose', ext: '.kt', icon: Smartphone, color: 'text-green-400', description: 'Jetpack Compose for Android' },
  { key: 'flutter', label: 'Flutter', ext: '.dart', icon: FileType, color: 'text-blue-400', description: 'Flutter widget for cross-platform' },
];

export function DeployView({ codeData, componentName, assets = [], fileKey }: DeployViewProps) {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [zipping, setZipping] = React.useState(false);

  if (!codeData) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-light mb-2">Deploy</h2>
        <p className="text-white/40 mb-8">Run the engine first to enable exports.</p>
        <div className="glass-card p-16 rounded-2xl flex flex-col items-center justify-center text-white/20">
          <Rocket className="w-12 h-12 mb-4 opacity-50" />
          <p>No code to export</p>
        </div>
      </div>
    );
  }

  const handleCopy = async (key: string, code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadFile = (code: string, ext: string) => {
    const blob = new Blob([code], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${componentName}${ext}`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const handleDownloadZip = async () => {
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const { saveAs } = await import('file-saver');

      const zip = new JSZip();
      zip.folder('react')?.file(`${componentName}.tsx`, codeData.react);
      zip.folder('swiftui')?.file(`${componentName}View.swift`, codeData.swiftui);
      zip.folder('compose')?.file(`${componentName}Screen.kt`, codeData.compose);
      zip.folder('flutter')?.file(`${componentName}Screen.dart`, codeData.flutter);

      // Include extracted assets (icons as SVG, images as PNG)
      const downloadableAssets = assets.filter(a => a.exportUrl && a.category !== 'drawable');
      if (downloadableAssets.length > 0) {
        const iconsFolder = zip.folder('assets/icons');
        const imagesFolder = zip.folder('assets/images');

        for (const asset of downloadableAssets) {
          try {
            const res = await fetch(asset.exportUrl!);
            if (!res.ok) continue;
            const blob = await res.blob();
            const folder = asset.category === 'icon' ? iconsFolder : imagesFolder;
            folder?.file(`${asset.name}.${asset.format}`, blob);
          } catch {
            // Skip failed asset downloads
          }
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${componentName}-export.zip`);
    } catch (e) {
      console.error('ZIP generation failed:', e);
    } finally {
      setZipping(false);
    }
  };

  const totalLines = TARGETS.reduce((sum, t) => sum + (codeData[t.key]?.split('\n').length || 0), 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light">Deploy</h2>
          <p className="text-white/40 text-sm mt-1">{componentName} &middot; {totalLines} total lines across 4 platforms</p>
        </div>
      </div>

      {/* Download All ZIP */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-electric-blue/20 to-deep-violet/20">
              <Package className="w-6 h-6 text-electric-blue" />
            </div>
            <div>
              <h3 className="font-medium">Download All Platforms</h3>
              <p className="text-xs text-white/40 mt-0.5">ZIP containing React, SwiftUI, Compose, Flutter files{assets.length > 0 ? ` + ${assets.filter(a => a.category !== 'drawable').length} assets` : ''}</p>
            </div>
          </div>
          <button
            onClick={handleDownloadZip}
            disabled={zipping}
            className="gradient-primary text-obsidian-lowest px-6 py-3 rounded-lg font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-electric-blue/20 disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {zipping ? 'Generating...' : 'Download ZIP'}
          </button>
        </div>
      </div>

      {/* Individual Targets */}
      <div className="space-y-3">
        {TARGETS.map(target => {
          const code = codeData[target.key] || '';
          const lineCount = code.split('\n').length;
          const sizeKB = (new Blob([code]).size / 1024).toFixed(1);
          const isCopied = copiedKey === target.key;
          const TargetIcon = target.icon;

          return (
            <div key={target.key} className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn('p-2.5 rounded-lg bg-white/5')}>
                    <TargetIcon className={cn('w-5 h-5', target.color)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{target.label}</h4>
                      <span className="text-[10px] font-mono text-white/30 px-1.5 py-0.5 rounded bg-white/5">
                        {target.ext}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{target.description} &middot; {lineCount} lines &middot; {sizeKB}KB</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(target.key, code)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all',
                      isCopied ? 'bg-green-400/10 text-green-400' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                    )}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleDownloadFile(code, target.ext)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              </div>

              {/* Code preview snippet */}
              <div className="mt-3 p-3 rounded-lg bg-obsidian-bg/50 border border-white/5 overflow-hidden">
                <pre className="text-[11px] font-mono text-white/40 leading-4 line-clamp-3">{code.slice(0, 200)}</pre>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
