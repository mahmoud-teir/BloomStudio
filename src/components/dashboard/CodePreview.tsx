'use client';

import React from 'react';
import { Code, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

type CodeTab = 'react' | 'swiftui' | 'compose' | 'flutter';

interface CodePreviewProps {
  codeData: { react: string; swiftui: string; compose: string; flutter: string } | null;
  activeTab: CodeTab;
  onTabChange: (tab: CodeTab) => void;
}

const TAB_LABELS: Record<CodeTab, string> = {
  react: 'React (Tailwind)',
  swiftui: 'SwiftUI',
  compose: 'Compose',
  flutter: 'Flutter',
};

const TAB_EXT: Record<CodeTab, string> = {
  react: '.tsx',
  swiftui: '.swift',
  compose: '.kt',
  flutter: '.dart',
};

export function CodePreview({ codeData, activeTab, onTabChange }: CodePreviewProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!codeData) return;
    await navigator.clipboard.writeText(codeData[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!codeData) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-light mb-2">Code Preview</h2>
        <p className="text-white/40 mb-8">Run the engine first to see generated code.</p>
        <div className="glass-card p-16 rounded-2xl flex flex-col items-center justify-center text-white/20">
          <Code className="w-12 h-12 mb-4 opacity-50" />
          <p>No code generated yet</p>
        </div>
      </div>
    );
  }

  const code = codeData[activeTab] || '';
  const lines = code.split('\n');

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light">Code Preview</h2>
          <p className="text-white/40 text-sm mt-1">{lines.length} lines &middot; {TAB_EXT[activeTab]}</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 240px)' }}>
        {/* Tab bar */}
        <div className="h-12 px-6 flex items-center justify-between border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
            <span className="text-xs font-medium text-white/30 ml-4 font-mono">generation_output{TAB_EXT[activeTab]}</span>
          </div>
          <div className="flex items-center gap-2">
            {(Object.keys(TAB_LABELS) as CodeTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all',
                  activeTab === tab
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                )}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Code area with line numbers */}
        <div className="flex-1 bg-obsidian-bg overflow-auto">
          <div className="flex">
            {/* Line numbers */}
            <div className="py-4 pl-4 pr-2 select-none flex-shrink-0 border-r border-white/5">
              {lines.map((_, i) => (
                <div key={i} className="text-[11px] font-mono text-white/15 text-right leading-5 h-5" style={{ minWidth: 32 }}>
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Code content */}
            <div className="p-4 flex-1 min-w-0">
              <pre className="text-sm font-mono text-white/80 leading-5 whitespace-pre-wrap break-words">
                <code>{code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
