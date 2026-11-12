/**
 * Mock Data Generator - Create sample transcript data for testing
 */

export function generateMockTranscript(): string {
  const entries = [
    {
      type: 'message',
      role: 'user',
      content: 'Build a pixel art game',
      agent_id: 'agent-001',
      agent_name: 'CodeMaster',
      timestamp: new Date().toISOString(),
    },
    {
      type: 'message',
      role: 'assistant',
      content: 'I will create a pixel art game for you.',
      agent_id: 'agent-001',
      usage: { input_tokens: 150, output_tokens: 50, cost: 0.001 },
    },
    {
      type: 'tool_use',
      tool_name: 'write_file',
      tool_input: { path: 'game.ts', content: 'export class Game {}' },
      agent_id: 'agent-001',
    },
    {
      type: 'tool_result',
      tool_use_id: 'tool-001',
      content: 'File written successfully',
    },
    {
      type: 'message',
      role: 'user',
      content: 'Add animation support',
      agent_id: 'agent-002',
      agent_name: 'AnimationBot',
      timestamp: new Date().toISOString(),
    },
    {
      type: 'message',
      role: 'assistant',
      content: 'Adding animation support to the game.',
      agent_id: 'agent-002',
      usage: { input_tokens: 200, output_tokens: 75, cost: 0.0015 },
    },
    {
      type: 'tool_use',
      tool_name: 'write_file',
      tool_input: { path: 'animation.ts', content: 'export class Animation {}' },
      agent_id: 'agent-002',
    },
  ];

  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}

export function generateMultiAgentTranscript(): string {
  const agents = ['agent-001', 'agent-002', 'agent-003'];
  const agentNames = ['CodeMaster', 'AnimationBot', 'DataWizard'];
  const tools = ['write_file', 'read_file', 'run_command', 'search_files'];
  const entries: any[] = [];

  for (let i = 0; i < 20; i++) {
    const agentIndex = i % agents.length;
    const agentId = agents[agentIndex];
    const agentName = agentNames[agentIndex];

    if (i % 5 === 0) {
      entries.push({
        type: 'message',
        role: 'user',
        content: `Task ${i}`,
        agent_id: agentId,
        agent_name: agentName,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    entries.push({
      type: 'message',
      role: 'assistant',
      content: `Processing task ${i}`,
      agent_id: agentId,
      usage: {
        input_tokens: Math.floor(Math.random() * 1000),
        output_tokens: Math.floor(Math.random() * 500),
        cost: Math.random() * 0.01,
      },
    });

    if (i % 3 === 0) {
      entries.push({
        type: 'tool_use',
        tool_name: tools[Math.floor(Math.random() * tools.length)],
        tool_input: { path: `file-${i}.ts` },
        agent_id: agentId,
      });
    }
  }

  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}
