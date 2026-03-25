'use client';

import React from 'react';
import { motion } from 'motion/react';
import {
  Zap, Layers, Monitor, Terminal, FileCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { DesktopView } from '@/components/dashboard/DesktopView';
import { LayerHierarchy } from '@/components/dashboard/LayerHierarchy';
import { CodePreview } from '@/components/dashboard/CodePreview';
import { ExecutionLogs } from '@/components/dashboard/ExecutionLogs';
import { CanvasView } from '@/components/dashboard/CanvasView';
import { LibraryView } from '@/components/dashboard/LibraryView';
import { DeployView } from '@/components/dashboard/DeployView';

type TopNav = 'engine' | 'canvas' | 'library' | 'deploy';
type SidebarTab = 'desktop' | 'layers' | 'code' | 'logs';

export default function ObsidianDashboard() {
  // Navigation
  const [activeTopNav, setActiveTopNav] = React.useState<TopNav>('engine');
  const [activeSidebar, setActiveSidebar] = React.useState<SidebarTab>('desktop');

  // Input
  const [url, setUrl] = React.useState('https://www.figma.com/design/lOaHovB1V7Rz12L2DDBa3r/The-Obsidian-Synthesis?node-id=0-1');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // Generation data
  const [stats, setStats] = React.useState<any>(null);
  const [codeData, setCodeData] = React.useState<{ react: string; swiftui: string; compose: string; flutter: string } | null>(null);
  const [activeTab, setActiveTab] = React.useState<'react' | 'swiftui' | 'compose' | 'flutter'>('react');
  const [latency, setLatency] = React.useState(0);

  // New data from expanded API
  const [uiTree, setUiTree] = React.useState<any>(null);
  const [cleanedTree, setCleanedTree] = React.useState<any>(null);
  const [pipeline, setPipeline] = React.useState<any>(null);
  const [designSystem, setDesignSystem] = React.useState<any>(null);
  const [fileKey, setFileKey] = React.useState('');
  const [componentName, setComponentName] = React.useState('FigmaComponent');
  const [previewImageUrl, setPreviewImageUrl] = React.useState('');

  const handleGenerate = async () => {
    if (!url) return;
    setLoading(true);
    setError('');
    const start = Date.now();
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate code');

      setStats(data.stats);
      setCodeData(data.code);
      setUiTree(data.uiTree);
      setCleanedTree(data.cleanedTree);
      setPipeline(data.pipeline);
      setDesignSystem(data.designSystem);
      setFileKey(data.fileKey || '');
      setComponentName(data.componentName || 'FigmaComponent');
      setLatency(Date.now() - start);

      // Fetch preview image
      if (data.fileKey) {
        fetchPreviewImage(data.fileKey, data.cleanedTree?.id);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviewImage = async (fKey: string, nodeId?: string) => {
    try {
      const ids = nodeId ? nodeId.replace(/-/g, ':') : '0:1';
      const res = await fetch(`/api/figma?endpoint=images&fileKey=${fKey}&ids=${ids}&format=png&scale=2`);
      const data = await res.json();
      if (data.images) {
        const firstUrl = Object.values(data.images).find(Boolean) as string;
        if (firstUrl) setPreviewImageUrl(firstUrl);
      }
    } catch {
      // Preview image is optional
    }
  };

  const handleExport = () => {
    if (!codeData) return;
    const blob = new Blob([codeData[activeTab]], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${componentName}.${activeTab === 'react' ? 'tsx' : activeTab === 'swiftui' ? 'swift' : activeTab === 'flutter' ? 'dart' : 'kt'}`;
    a.click();
    URL.revokeObjectURL(href);
  };

  // When switching top nav away from engine, reset sidebar highlight
  const handleTopNav = (nav: TopNav) => {
    setActiveTopNav(nav);
  };

  return (
    <div className="min-h-screen bg-obsidian-bg text-on-surface flex flex-col selection:bg-electric-blue/20">
      {/* Structural Glows */}
      <div className="fixed top-0 left-1/4 w-[800px] h-[400px] bg-electric-blue/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[500px] bg-deep-violet/5 blur-[150px] rounded-full -z-10 pointer-events-none" />

      {/* Header */}
      <nav className="h-20 border-b border-white/5 backdrop-blur-xl fixed top-0 w-full z-50 px-8 flex justify-between items-center">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => { setActiveTopNav('engine'); setActiveSidebar('desktop'); }}>
            <div className="relative">
              <div className="absolute inset-0 bg-electric-blue/40 blur-md rounded-full group-hover:blur-lg transition-all" />
              <Zap className="w-6 h-6 text-obsidian-bg fill-electric-blue relative z-10" />
            </div>
            <span className="text-xl font-light tracking-tight">
              Bloom <span className="font-bold">Studio</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <NavItem label="Engine" active={activeTopNav === 'engine'} onClick={() => handleTopNav('engine')} />
            <NavItem label="Canvas" active={activeTopNav === 'canvas'} onClick={() => handleTopNav('canvas')} />
            <NavItem label="Library" active={activeTopNav === 'library'} onClick={() => handleTopNav('library')} />
            <NavItem label="Deploy" active={activeTopNav === 'deploy'} onClick={() => handleTopNav('deploy')} />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={handleExport} disabled={!codeData} className="gradient-primary text-obsidian-lowest px-6 py-2 rounded-md font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-electric-blue/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
            Export Component
          </button>
        </div>
      </nav>

      <div className="flex flex-1 pt-20">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/5 bg-obsidian-low/30 backdrop-blur-md hidden lg:flex flex-col py-8 px-6">
          <div className="mb-10">
            <p className="text-label-sm text-white/40 mb-2">Project Workspace</p>
            <h3 className="text-lg font-medium">Obsidian Engine</h3>
          </div>

          <div className="space-y-1 flex-1">
            <SidebarItem
              icon={<Monitor className="w-4 h-4" />}
              label="Desktop View"
              active={activeTopNav === 'engine' && activeSidebar === 'desktop'}
              onClick={() => { setActiveTopNav('engine'); setActiveSidebar('desktop'); }}
            />
            <SidebarItem
              icon={<Layers className="w-4 h-4" />}
              label="Layer Hierarchy"
              active={activeTopNav === 'engine' && activeSidebar === 'layers'}
              onClick={() => { setActiveTopNav('engine'); setActiveSidebar('layers'); }}
            />
            <SidebarItem
              icon={<FileCode className="w-4 h-4" />}
              label="Code Preview"
              active={activeTopNav === 'engine' && activeSidebar === 'code'}
              onClick={() => { setActiveTopNav('engine'); setActiveSidebar('code'); }}
            />
            <SidebarItem
              icon={<Terminal className="w-4 h-4" />}
              label="Execution Logs"
              active={activeTopNav === 'engine' && activeSidebar === 'logs'}
              onClick={() => { setActiveTopNav('engine'); setActiveSidebar('logs'); }}
            />
          </div>

          <div className="mt-auto">
            <div className="glass-card p-4 rounded-xl mb-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Engine Status</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${loading ? 'text-yellow-400 bg-yellow-400/10' : stats ? 'text-green-400 bg-green-400/10' : 'text-electric-blue bg-electric-blue/10'}`}>
                  {loading ? 'Processing' : stats ? 'Complete' : 'Idle'}
                </span>
              </div>
              {loading && (
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="h-full bg-electric-blue"
                  />
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-10 bg-obsidian-lowest/20">
          {/* Engine -> Desktop View */}
          {activeTopNav === 'engine' && activeSidebar === 'desktop' && (
            <DesktopView
              url={url}
              setUrl={setUrl}
              loading={loading}
              onGenerate={handleGenerate}
              stats={stats}
              latency={latency}
              previewImageUrl={previewImageUrl}
              codeData={codeData}
              error={error}
            />
          )}

          {/* Engine -> Layer Hierarchy */}
          {activeTopNav === 'engine' && activeSidebar === 'layers' && (
            <LayerHierarchy uiTree={uiTree} />
          )}

          {/* Engine -> Code Preview */}
          {activeTopNav === 'engine' && activeSidebar === 'code' && (
            <CodePreview codeData={codeData} activeTab={activeTab} onTabChange={setActiveTab} />
          )}

          {/* Engine -> Execution Logs */}
          {activeTopNav === 'engine' && activeSidebar === 'logs' && (
            <ExecutionLogs pipeline={pipeline} latency={latency} />
          )}

          {/* Canvas */}
          {activeTopNav === 'canvas' && (
            <CanvasView cleanedTree={cleanedTree} />
          )}

          {/* Library */}
          {activeTopNav === 'library' && (
            <LibraryView uiTree={uiTree} stats={stats} designSystem={designSystem} />
          )}

          {/* Deploy */}
          {activeTopNav === 'deploy' && (
            <DeployView codeData={codeData} componentName={componentName} />
          )}
        </main>
      </div>
    </div>
  );
}

function NavItem({ label, active = false, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); onClick?.(); }}
      className={cn(
        'text-sm font-medium transition-colors hover:text-electric-blue',
        active ? 'text-electric-blue' : 'text-white/40'
      )}
    >
      {label}
    </a>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all',
        active
          ? 'bg-electric-blue/10 text-electric-blue border border-electric-blue/20'
          : 'text-white/40 hover:text-white hover:bg-white/5'
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-electric-blue animate-pulse" />}
    </div>
  );
}
