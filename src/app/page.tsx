'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Layers, Monitor, Terminal, FileCode, Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { UINode } from '@/lib/smart-parser';
// DesignSystem type is used for the design tokens panel in LibraryView
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DesignSystemData = any;

// Lazy load heavy dashboard views
const DesktopView = React.lazy(() => import('@/components/dashboard/DesktopView').then(m => ({ default: m.DesktopView })));
const LayerHierarchy = React.lazy(() => import('@/components/dashboard/LayerHierarchy').then(m => ({ default: m.LayerHierarchy })));
const CodePreview = React.lazy(() => import('@/components/dashboard/CodePreview').then(m => ({ default: m.CodePreview })));
const ExecutionLogs = React.lazy(() => import('@/components/dashboard/ExecutionLogs').then(m => ({ default: m.ExecutionLogs })));
const CanvasView = React.lazy(() => import('@/components/dashboard/CanvasView').then(m => ({ default: m.CanvasView })));
const LibraryView = React.lazy(() => import('@/components/dashboard/LibraryView').then(m => ({ default: m.LibraryView })));
const DeployView = React.lazy(() => import('@/components/dashboard/DeployView').then(m => ({ default: m.DeployView })));

type TopNav = 'engine' | 'canvas' | 'library' | 'deploy';
type SidebarTab = 'desktop' | 'layers' | 'code' | 'logs';

interface CodeData {
  react: string;
  swiftui: string;
  compose: string;
  flutter: string;
}

interface PipelineStage {
  name: string;
  status: string;
  detail: string;
}

interface PipelineData {
  issues: Array<{
    nodeId: string;
    nodeName: string;
    severity: 'error' | 'warning' | 'info';
    category: string;
    message: string;
    fix?: string;
  }>;
  pipelineStats: {
    nodesRemoved: number;
    nodesNormalized: number;
    issueCount: { error: number; warning: number; info: number };
  };
  stages: PipelineStage[];
}

interface TreeStats {
  totalNodes: number;
  reusableCount: number;
  lazyListCount: number;
  typeBreakdown: Record<string, number>;
}

function ViewLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-electric-blue border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ObsidianDashboard() {
  const isMobile = useIsMobile();

  // Navigation
  const [activeTopNav, setActiveTopNav] = React.useState<TopNav>('engine');
  const [activeSidebar, setActiveSidebar] = React.useState<SidebarTab>('desktop');
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Input
  const [url, setUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // Generation data — properly typed
  const [stats, setStats] = React.useState<TreeStats | null>(null);
  const [codeData, setCodeData] = React.useState<CodeData | null>(null);
  const [activeTab, setActiveTab] = React.useState<'react' | 'swiftui' | 'compose' | 'flutter'>('react');
  const [latency, setLatency] = React.useState(0);

  // New data from expanded API
  const [uiTree, setUiTree] = React.useState<UINode | null>(null);
  // cleanedTree comes from the Figma API and matches the FigmaNode shape expected by CanvasView
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cleanedTree, setCleanedTree] = React.useState<any>(null);
  const [pipeline, setPipeline] = React.useState<PipelineData | null>(null);
  const [designSystem, setDesignSystem] = React.useState<DesignSystemData | null>(null);
  const [fileKey, setFileKey] = React.useState('');
  const [componentName, setComponentName] = React.useState('FigmaComponent');
  const [previewImageUrl, setPreviewImageUrl] = React.useState('');

  const handleGenerate = async () => {
    if (!url) return;

    // Basic URL validation
    if (!url.includes('figma.com')) {
      setError('Please enter a valid Figma URL (e.g., https://www.figma.com/design/...)');
      return;
    }

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

      // Save session to memory
      saveSession(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred';
      setError(message);
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

  const saveSession = async (data: Record<string, unknown>) => {
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          componentName: data.componentName,
          stats: data.stats,
          generatedAt: new Date().toISOString(),
        }),
      });
    } catch {
      // Session saving is optional, don't block user flow
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

  const handleTopNav = (nav: TopNav) => {
    setActiveTopNav(nav);
    setMobileMenuOpen(false);
  };

  const handleSidebarNav = (tab: SidebarTab) => {
    setActiveTopNav('engine');
    setActiveSidebar(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-obsidian-bg text-on-surface flex flex-col selection:bg-electric-blue/20">
      {/* Structural Glows */}
      <div className="fixed top-0 left-1/4 w-[800px] h-[400px] bg-electric-blue/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[500px] bg-deep-violet/5 blur-[150px] rounded-full -z-10 pointer-events-none" />

      {/* Header */}
      <nav className="h-16 md:h-20 border-b border-white/5 backdrop-blur-xl fixed top-0 w-full z-50 px-4 md:px-8 flex justify-between items-center">
        <div className="flex items-center gap-4 md:gap-12">
          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 -ml-2 text-white/60 hover:text-white transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => { setActiveTopNav('engine'); setActiveSidebar('desktop'); setMobileMenuOpen(false); }}>
            <div className="relative">
              <div className="absolute inset-0 bg-electric-blue/40 blur-md rounded-full group-hover:blur-lg transition-all" />
              <Zap className="w-5 h-5 md:w-6 md:h-6 text-obsidian-bg fill-electric-blue relative z-10" />
            </div>
            <span className="text-lg md:text-xl font-light tracking-tight">
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

        <div className="flex items-center gap-4 md:gap-6">
          <button onClick={handleExport} disabled={!codeData} className="gradient-primary text-obsidian-lowest px-4 md:px-6 py-2 rounded-md font-bold text-xs md:text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-electric-blue/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
            Export
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-16 left-0 bottom-0 w-72 border-r border-white/5 bg-obsidian-low/95 backdrop-blur-xl z-50 lg:hidden flex flex-col py-6 px-6 overflow-y-auto"
            >
              {/* Top Navigation (mobile) */}
              <div className="mb-6">
                <p className="text-label-sm text-white/40 mb-3">Navigation</p>
                <div className="space-y-1">
                  {(['engine', 'canvas', 'library', 'deploy'] as TopNav[]).map(nav => (
                    <div
                      key={nav}
                      onClick={() => handleTopNav(nav)}
                      className={cn(
                        'px-4 py-2.5 rounded-lg cursor-pointer transition-all text-sm font-medium capitalize',
                        activeTopNav === nav
                          ? 'bg-electric-blue/10 text-electric-blue border border-electric-blue/20'
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                      )}
                    >
                      {nav}
                    </div>
                  ))}
                </div>
              </div>

              {/* Engine Sidebar (mobile) */}
              <div className="mb-6">
                <p className="text-label-sm text-white/40 mb-3">Engine Views</p>
                <div className="space-y-1">
                  <SidebarItem icon={<Monitor className="w-4 h-4" />} label="Desktop View" active={activeTopNav === 'engine' && activeSidebar === 'desktop'} onClick={() => handleSidebarNav('desktop')} />
                  <SidebarItem icon={<Layers className="w-4 h-4" />} label="Layer Hierarchy" active={activeTopNav === 'engine' && activeSidebar === 'layers'} onClick={() => handleSidebarNav('layers')} />
                  <SidebarItem icon={<FileCode className="w-4 h-4" />} label="Code Preview" active={activeTopNav === 'engine' && activeSidebar === 'code'} onClick={() => handleSidebarNav('code')} />
                  <SidebarItem icon={<Terminal className="w-4 h-4" />} label="Execution Logs" active={activeTopNav === 'engine' && activeSidebar === 'logs'} onClick={() => handleSidebarNav('logs')} />
                </div>
              </div>

              {/* Engine Status (mobile) */}
              <div className="mt-auto">
                <div className="glass-card p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Engine Status</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${loading ? 'text-yellow-400 bg-yellow-400/10' : stats ? 'text-green-400 bg-green-400/10' : 'text-electric-blue bg-electric-blue/10'}`}>
                      {loading ? 'Processing' : stats ? 'Complete' : 'Idle'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 pt-16 md:pt-20">
        {/* Desktop Sidebar */}
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
              onClick={() => handleSidebarNav('desktop')}
            />
            <SidebarItem
              icon={<Layers className="w-4 h-4" />}
              label="Layer Hierarchy"
              active={activeTopNav === 'engine' && activeSidebar === 'layers'}
              onClick={() => handleSidebarNav('layers')}
            />
            <SidebarItem
              icon={<FileCode className="w-4 h-4" />}
              label="Code Preview"
              active={activeTopNav === 'engine' && activeSidebar === 'code'}
              onClick={() => handleSidebarNav('code')}
            />
            <SidebarItem
              icon={<Terminal className="w-4 h-4" />}
              label="Execution Logs"
              active={activeTopNav === 'engine' && activeSidebar === 'logs'}
              onClick={() => handleSidebarNav('logs')}
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
        <main className="flex-1 overflow-y-auto p-4 md:p-10 bg-obsidian-lowest/20">
          <React.Suspense fallback={<ViewLoader />}>
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
          </React.Suspense>
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
