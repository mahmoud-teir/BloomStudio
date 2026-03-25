'use client';

import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Move, Layout } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  visible?: boolean;
}

interface CanvasViewProps {
  cleanedTree: FigmaNode | null;
}

const TYPE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  FRAME: { border: '#3b82f6', bg: 'rgba(59,130,246,0.04)', text: '#3b82f6' },
  GROUP: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.04)', text: '#8b5cf6' },
  COMPONENT: { border: '#00f5ff', bg: 'rgba(0,245,255,0.06)', text: '#00f5ff' },
  COMPONENT_SET: { border: '#00f5ff', bg: 'rgba(0,245,255,0.04)', text: '#00f5ff' },
  INSTANCE: { border: '#22c55e', bg: 'rgba(34,197,94,0.06)', text: '#22c55e' },
  TEXT: { border: '#a855f7', bg: 'rgba(168,85,247,0.06)', text: '#a855f7' },
  RECTANGLE: { border: '#f59e0b', bg: 'rgba(245,158,11,0.04)', text: '#f59e0b' },
  ELLIPSE: { border: '#ec4899', bg: 'rgba(236,72,153,0.04)', text: '#ec4899' },
  VECTOR: { border: '#ef4444', bg: 'rgba(239,68,68,0.04)', text: '#ef4444' },
  BOOLEAN_OPERATION: { border: '#64748b', bg: 'rgba(100,116,139,0.04)', text: '#64748b' },
};

const DEFAULT_COLOR = { border: '#475569', bg: 'rgba(71,85,105,0.04)', text: '#94a3b8' };

export function CanvasView({ cleanedTree }: CanvasViewProps) {
  const [zoom, setZoom] = React.useState(0.5);
  const [pan, setPan] = React.useState({ x: 40, y: 40 });
  const [dragging, setDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  if (!cleanedTree) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-light mb-2">Canvas</h2>
        <p className="text-white/40 mb-8">Run the engine first to see the layout canvas.</p>
        <div className="glass-card p-16 rounded-2xl flex flex-col items-center justify-center text-white/20">
          <Layout className="w-12 h-12 mb-4 opacity-50" />
          <p>No design data available</p>
        </div>
      </div>
    );
  }

  const rootBB = cleanedTree.absoluteBoundingBox || { x: 0, y: 0, width: 800, height: 600 };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setDragging(false);

  const fitToView = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth - 80;
    const ch = containerRef.current.clientHeight - 80;
    const fitZoom = Math.min(cw / rootBB.width, ch / rootBB.height, 1);
    setZoom(Math.max(0.1, fitZoom));
    setPan({ x: 40, y: 40 });
  };

  return (
    <div className="max-w-full mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light">Canvas</h2>
          <p className="text-white/40 text-sm mt-1">Visual layout — {Math.round(rootBB.width)}x{Math.round(rootBB.height)}px</p>
        </div>
        <div className="flex items-center gap-1 glass-card rounded-lg px-2 py-1">
          <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/40 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={fitToView} className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setZoom(0.5); setPan({ x: 40, y: 40 }); }}
            className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors"
            title="Reset position"
          >
            <Move className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="glass-card rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ height: 'calc(100vh - 240px)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="w-full h-full bg-[#0a0a0a] relative overflow-hidden"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            <CanvasNode
              node={cleanedTree}
              rootX={rootBB.x}
              rootY={rootBB.y}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              depth={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasNode({
  node, rootX, rootY, hoveredId, onHover, depth,
}: {
  node: FigmaNode; rootX: number; rootY: number;
  hoveredId: string | null; onHover: (id: string | null) => void; depth: number;
}) {
  const bb = node.absoluteBoundingBox;
  if (!bb || bb.width <= 0 || bb.height <= 0) return null;
  if (node.visible === false) return null;

  const colors = TYPE_COLORS[node.type] || DEFAULT_COLOR;
  const isHovered = hoveredId === node.id;
  const x = bb.x - rootX;
  const y = bb.y - rootY;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: bb.width,
        height: bb.height,
        border: `1px solid ${isHovered ? colors.border : colors.border + '60'}`,
        backgroundColor: isHovered ? colors.bg.replace(/[\d.]+\)$/, '0.12)') : colors.bg,
        transition: 'background-color 0.15s, border-color 0.15s',
        zIndex: depth,
      }}
      onMouseEnter={(e) => { e.stopPropagation(); onHover(node.id); }}
      onMouseLeave={(e) => { e.stopPropagation(); onHover(null); }}
    >
      {/* Label — only show for larger nodes or when hovered */}
      {(bb.width > 60 && bb.height > 20 || isHovered) && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 1,
            left: 2,
            fontSize: Math.max(8, Math.min(11, bb.width / 12)),
            color: colors.text,
            opacity: isHovered ? 1 : 0.5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: bb.width - 6,
            lineHeight: 1.2,
          }}
        >
          {node.name}
        </div>
      )}

      {/* Hover tooltip */}
      {isHovered && (
        <div
          className="absolute z-[100] pointer-events-none glass-card rounded-lg px-3 py-2 text-xs whitespace-nowrap"
          style={{ bottom: '100%', left: 0, marginBottom: 4 }}
        >
          <span className="font-bold" style={{ color: colors.text }}>{node.type}</span>
          <span className="text-white/40"> — </span>
          <span className="text-white/70">{node.name}</span>
          <span className="text-white/30 ml-2">{Math.round(bb.width)}x{Math.round(bb.height)}</span>
        </div>
      )}

      {/* Render children */}
      {node.children?.map(child => (
        <CanvasNode
          key={child.id}
          node={child}
          rootX={rootX}
          rootY={rootY}
          hoveredId={hoveredId}
          onHover={onHover}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
