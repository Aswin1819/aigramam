/**
 * AgentPanel Component
 * Displays detailed information about a selected agent
 * Design: Pixel punk style with neon borders and glow effects
 */

import React from 'react';
import { AgentState } from '@/lib/pixelEngine';
import { X } from 'lucide-react';

interface AgentPanelProps {
  agent: AgentState | null;
  onClose: () => void;
  tokenUsed?: number;
  cost?: number;
}

const stateLabels: Record<string, string> = {
  idle: 'IDLE',
  walking: 'WALKING',
  typing: 'TYPING CODE',
  thinking: 'THINKING',
  waiting: 'WAITING INPUT',
};

const stateColors: Record<string, string> = {
  idle: '#888899',
  walking: '#00D9FF',
  typing: '#00FF41',
  thinking: '#FF00FF',
  waiting: '#FFD700',
};

export const AgentPanel: React.FC<AgentPanelProps> = ({
  agent,
  onClose,
  tokenUsed = 0,
  cost = 0,
}) => {
  if (!agent) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 pixel-panel-blue bg-card border-l-4 border-accent p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold neon-glow-green uppercase">{agent.name}</h2>
        <button
          onClick={onClose}
          className="text-accent hover:text-neon-purple transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Agent ID */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">ID</p>
        <p className="font-mono text-sm text-accent">{agent.id}</p>
      </div>

      {/* Status */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">STATUS</p>
        <div
          className="inline-block px-3 py-1 border-2 font-bold text-xs uppercase"
          style={{
            borderColor: stateColors[agent.state],
            color: stateColors[agent.state],
            textShadow: `0 0 10px ${stateColors[agent.state]}`,
          }}
        >
          {stateLabels[agent.state]}
        </div>
      </div>

      {/* Position */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">POSITION</p>
        <p className="font-mono text-sm text-card-foreground">
          X: {agent.position.x} | Y: {agent.position.y}
        </p>
      </div>

      {/* Direction */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">DIRECTION</p>
        <p className="font-mono text-sm text-card-foreground uppercase">{agent.direction}</p>
      </div>

      {/* Token Usage */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">TOKENS USED</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-background border border-border h-6 relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-secondary"
              style={{ width: `${Math.min((tokenUsed / 10000) * 100, 100)}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
              {tokenUsed}
            </span>
          </div>
        </div>
      </div>

      {/* Cost */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">COST (USD)</p>
        <p className="font-mono text-lg text-secondary font-bold">${cost.toFixed(4)}</p>
      </div>

      {/* Color Indicator */}
      <div className="mb-4 pb-4 border-b-2 border-border">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">COLOR</p>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 border-2 border-border"
            style={{ backgroundColor: agent.color }}
          />
          <p className="font-mono text-sm text-card-foreground">{agent.color}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t-2 border-border text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">
          AGENT ONLINE
        </p>
      </div>
    </div>
  );
};

export default AgentPanel;
