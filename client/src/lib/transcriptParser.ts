/**
 * Transcript Parser - Parse Claude Code JSONL transcript files
 * Extracts agent activity and state information for visualization
 */

export interface TranscriptEntry {
  type: string;
  timestamp?: string;
  content?: string;
  tool_use_id?: string;
  tool_name?: string;
  [key: string]: any;
}

export interface AgentActivity {
  id: string;
  name: string;
  state: 'idle' | 'typing' | 'reading' | 'executing' | 'thinking' | 'waiting';
  currentTask?: string;
  tokenUsed: number;
  cost: number;
  lastUpdate: number;
}

export interface ParsedTranscript {
  agents: Map<string, AgentActivity>;
  entries: TranscriptEntry[];
  totalCost: number;
  totalTokens: number;
  timestamp: number;
}

/**
 * Parse JSONL transcript data
 */
export function parseTranscript(jsonlText: string): ParsedTranscript {
  const lines = jsonlText.trim().split('\n');
  const entries: TranscriptEntry[] = [];
  const agents: Map<string, AgentActivity> = new Map();

  let totalCost = 0;
  let totalTokens = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);
      entries.push(entry);

      // Extract agent information from entry
      if (entry.type === 'message' && entry.role === 'assistant') {
        const agentId = entry.agent_id || 'default';
        
        if (!agents.has(agentId)) {
          agents.set(agentId, {
            id: agentId,
            name: entry.agent_name || `Agent ${agentId.slice(0, 4)}`,
            state: 'thinking',
            currentTask: undefined,
            tokenUsed: 0,
            cost: 0,
            lastUpdate: Date.now(),
          });
        }

        const agent = agents.get(agentId)!;
        agent.state = 'typing';
        agent.lastUpdate = Date.now();
      }

      // Track tool usage
      if (entry.type === 'tool_use') {
        const agentId = entry.agent_id || 'default';
        if (agents.has(agentId)) {
          const agent = agents.get(agentId)!;
          agent.state = 'executing';
          agent.currentTask = entry.tool_name;
          agent.lastUpdate = Date.now();
        }
      }

      // Track costs and tokens
      if (entry.usage) {
        totalTokens += (entry.usage.input_tokens || 0) + (entry.usage.output_tokens || 0);
        if (entry.usage.cost) {
          totalCost += entry.usage.cost;
        }
      }
    } catch (e) {
      console.warn('Failed to parse transcript line:', line);
    }
  }

  // Set agents to idle if no recent activity
  const now = Date.now();
  agents.forEach((agent) => {
    if (now - agent.lastUpdate > 5000) {
      agent.state = 'idle';
    }
  });

  return {
    agents,
    entries,
    totalCost,
    totalTokens,
    timestamp: Date.now(),
  };
}

/**
 * Simulate agent activity from transcript
 */
export function simulateAgentActivity(parsed: ParsedTranscript): AgentActivity[] {
  const activities: AgentActivity[] = [];

  parsed.agents.forEach((agent) => {
    activities.push({
      ...agent,
      // Simulate some variation in token usage
      tokenUsed: Math.floor(Math.random() * 5000) + 1000,
      cost: Math.random() * 0.05,
    });
  });

  return activities;
}

/**
 * Extract Claude Code status line JSON
 */
export function parseStatusLineJSON(jsonText: string): any {
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error('Failed to parse status line JSON:', e);
    return null;
  }
}

/**
 * Calculate agent state from transcript entries
 */
export function calculateAgentState(entries: TranscriptEntry[]): string {
  if (entries.length === 0) return 'idle';

  const lastEntry = entries[entries.length - 1];

  if (lastEntry.type === 'tool_use') {
    return 'executing';
  } else if (lastEntry.type === 'message' && lastEntry.role === 'assistant') {
    return 'typing';
  } else if (lastEntry.type === 'message' && lastEntry.role === 'user') {
    return 'waiting';
  }

  return 'thinking';
}
