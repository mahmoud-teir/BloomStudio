'use client';

import React from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Info,
  Eraser, SlidersHorizontal, ShieldCheck, GitBranch, Code, Terminal, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineStage {
  name: string;
  status: string;
  detail: string;
}

interface ValidationIssue {
  nodeId: string;
  nodeName: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  fix?: string;
}

interface PipelineData {
  issues: ValidationIssue[];
  pipelineStats: {
    nodesRemoved: number;
    nodesNormalized: number;
    issueCount: { error: number; warning: number; info: number };
  };
  stages: PipelineStage[];
}

interface ExecutionLogsProps {
  pipeline: PipelineData | null;
  latency: number;
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  Clean: Eraser,
  Normalize: SlidersHorizontal,
  Validate: ShieldCheck,
  'Build UI Tree': GitBranch,
  'Generate Code': Code,
};

const SEVERITY_CONFIG = {
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
};

export function ExecutionLogs({ pipeline, latency }: ExecutionLogsProps) {
  const [expandedIssues, setExpandedIssues] = React.useState(true);

  if (!pipeline) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-light mb-2">Execution Logs</h2>
        <p className="text-white/40 mb-8">Run the engine first to see processing logs.</p>
        <div className="glass-card p-16 rounded-2xl flex flex-col items-center justify-center text-white/20">
          <Terminal className="w-12 h-12 mb-4 opacity-50" />
          <p>No logs available</p>
        </div>
      </div>
    );
  }

  const { stages, issues, pipelineStats } = pipeline;
  const totalIssues = pipelineStats.issueCount.error + pipelineStats.issueCount.warning + pipelineStats.issueCount.info;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-light">Execution Logs</h2>
          <p className="text-white/40 text-sm mt-1">Pipeline completed in {latency}ms</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-white/30" />
          <span className="text-white/40">{latency}ms total</span>
        </div>
      </div>

      {/* Pipeline Timeline */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/40 mb-4">Pipeline Stages</h3>
        <div className="space-y-0">
          {stages.map((stage, i) => {
            const StageIcon = STAGE_ICONS[stage.name] || Code;
            const isLast = i === stages.length - 1;
            return (
              <div key={stage.name} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-white/10 my-1" />}
                </div>
                {/* Content */}
                <div className={cn('pb-5', isLast && 'pb-0')}>
                  <div className="flex items-center gap-2">
                    <StageIcon className="w-4 h-4 text-white/50" />
                    <span className="text-sm font-medium">{stage.name}</span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{stage.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-light">{pipelineStats.nodesRemoved}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Nodes Removed</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-light">{pipelineStats.nodesNormalized}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Normalized</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-light">{totalIssues}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Issues Found</p>
        </div>
      </div>

      {/* Validation Issues */}
      {issues.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <button
            onClick={() => setExpandedIssues(!expandedIssues)}
            className="w-full h-12 px-6 flex items-center justify-between bg-white/5 hover:bg-white/[0.07] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold uppercase tracking-wider text-white/40">Validation Issues</span>
              <div className="flex items-center gap-2">
                {pipelineStats.issueCount.error > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-400/10 text-red-400">
                    {pipelineStats.issueCount.error} errors
                  </span>
                )}
                {pipelineStats.issueCount.warning > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400">
                    {pipelineStats.issueCount.warning} warnings
                  </span>
                )}
                {pipelineStats.issueCount.info > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">
                    {pipelineStats.issueCount.info} info
                  </span>
                )}
              </div>
            </div>
            <span className="text-white/30 text-xs">{expandedIssues ? 'Collapse' : 'Expand'}</span>
          </button>

          {expandedIssues && (
            <div className="max-h-[400px] overflow-auto">
              {issues.map((issue, i) => {
                const config = SEVERITY_CONFIG[issue.severity];
                const SevIcon = config.icon;
                return (
                  <div key={i} className={cn('px-6 py-3 border-t border-white/5 flex gap-3', i === 0 && 'border-t-0')}>
                    <SevIcon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', config.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-white/30">{issue.nodeName || issue.nodeId}</span>
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', config.bg, config.color)}>
                          {issue.category}
                        </span>
                      </div>
                      <p className="text-sm text-white/70">{issue.message}</p>
                      {issue.fix && (
                        <p className="text-xs text-white/40 mt-1">Fix: {issue.fix}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
