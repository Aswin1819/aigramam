/**
 * StatsPanel Component
 * Displays overall statistics and metrics
 * Design: Pixel punk style with neon borders
 */

import React from 'react';

interface StatsPanelProps {
  totalAgents: number;
  totalTokens: number;
  totalCost: number;
  activeAgents: number;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  totalAgents,
  totalTokens,
  totalCost,
  activeAgents,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {/* Total Agents */}
      <div className="pixel-panel p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">AGENTS</p>
        <p className="text-2xl font-bold neon-glow-green">{totalAgents}</p>
      </div>

      {/* Active Agents */}
      <div className="pixel-panel-purple p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">ACTIVE</p>
        <p className="text-2xl font-bold neon-glow-purple">{activeAgents}</p>
      </div>

      {/* Total Tokens */}
      <div className="pixel-panel-blue p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">TOKENS</p>
        <p className="text-2xl font-bold neon-glow-blue">{totalTokens.toLocaleString()}</p>
      </div>

      {/* Total Cost */}
      <div className="pixel-panel p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">COST</p>
        <p className="text-2xl font-bold text-accent">${totalCost.toFixed(4)}</p>
      </div>
    </div>
  );
};

export default StatsPanel;
