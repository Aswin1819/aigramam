/** Settings → Skills & agents: opens the read-only viewer. */
export default function SkillsTab(p: { onOpenSkills: () => void }) {
  return (
    <div className="space-y-3 text-sm text-cream/85">
      <p>See your Claude Code skills (<code>~/.claude/skills</code>) and subagents (<code>~/.claude/agents</code>), globally or per project. Read-only: edit them in Claude Code or your editor.</p>
      <button onClick={p.onOpenSkills} className="rounded-xl bg-brass px-4 py-2 text-sm font-semibold text-ink">Open skills & agents</button>
    </div>
  );
}
