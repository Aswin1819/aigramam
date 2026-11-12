/**
 * Agents Router - real Claude Code skills/agents CRUD, config and connection status
 *
 * Claude Code file structure:
 *   Transcripts: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *   Global skills: ~/.claude/skills/<skill-name>/SKILL.md
 *   Project skills: <project>/.claude/skills/<skill-name>/SKILL.md
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import fs from "fs";
import path from "path";
import os from "os";
import { getOrCreateApiKey } from "../bridge";
import { TRPCError } from "@trpc/server";
import { safeChildPath } from "../_core/security";

/** safeChildPath, reported to the client as a 400 instead of a 500. */
function childPath(dir: string, name: string, suffix = ""): string {
  try {
    return safeChildPath(dir, name, suffix);
  } catch (e) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** A real Claude Code skill backed by a SKILL.md file */
export interface ClaudeSkill {
  name: string;           // folder name = slash command
  displayName: string;    // from frontmatter `name` field
  description: string;    // from frontmatter `description` field
  content: string;        // full SKILL.md content (frontmatter + body)
  scope: "global" | "project";
  projectPath?: string;   // only for project-level skills
  skillPath: string;      // absolute path to the skill directory
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, ".claude");
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const GLOBAL_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const DATA_DIR = path.join(HOME_DIR, ".claude-dungeon");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AppConfig {
  claudeDir: string;
  watchedProjectPaths: string[];
  theme: "dark" | "light";
}

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return {
    claudeDir: CLAUDE_DIR,
    watchedProjectPaths: [],
    theme: "dark",
  };
}

function saveConfig(config: AppConfig) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── Persistence Helpers ──────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Real Claude Code Skills File System ─────────────────────────────────────

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: "", description: "" };
  const fm = fmMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
  };
}

/**
 * Read all skills from a skills directory (global or project-level)
 */
function readSkillsFromDir(
  skillsDir: string,
  scope: "global" | "project",
  projectPath?: string
): ClaudeSkill[] {
  if (!fs.existsSync(skillsDir)) return [];
  const skills: ClaudeSkill[] = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(skillsDir, entry.name);
      const skillMdPath = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;
      const content = fs.readFileSync(skillMdPath, "utf-8");
      const { name, description } = parseSkillFrontmatter(content);
      skills.push({
        name: entry.name,
        displayName: name || entry.name,
        description,
        content,
        scope,
        projectPath,
        skillPath: skillDir,
      });
    }
  } catch (e) {
    console.error("[Skills] Read failed:", e);
  }
  return skills;
}

/**
 * Write a skill to disk (create or update)
 * Creates: <skillsDir>/<skillName>/SKILL.md
 */
function writeSkill(skillsDir: string, skillName: string, content: string): void {
  const skillDir = childPath(skillsDir, skillName);
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");
}

/**
 * Delete a skill directory
 */
function deleteSkill(skillsDir: string, skillName: string): void {
  const skillDir = childPath(skillsDir, skillName);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

// ─── Real Claude Code Agents File System ──────────────────────────────────────────────────

export interface ClaudeAgent {
  name: string;           // filename without .md
  displayName: string;    // from frontmatter `name` field
  description: string;    // from frontmatter `description` field
  tools: string;          // from frontmatter `tools` field
  model: string;          // from frontmatter `model` field
  content: string;        // full .md content
  scope: "global" | "project";
  projectPath?: string;
  agentPath: string;      // absolute path to the .md file
}

/**
 * Parse agent .md frontmatter
 */
function parseAgentFrontmatter(content: string): { name: string; description: string; tools: string; model: string } {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return { name: "", description: "", tools: "", model: "" };
  const fm = fmMatch[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const toolsMatch = fm.match(/^tools:\s*(.+)$/m);
  const modelMatch = fm.match(/^model:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
    tools: toolsMatch ? toolsMatch[1].trim() : "",
    model: modelMatch ? modelMatch[1].trim() : "",
  };
}

/**
 * Read all agents from an agents directory (global or project-level)
 * Agents are stored as <agentsDir>/<agent-name>.md
 */
function readAgentsFromDir(
  agentsDir: string,
  scope: "global" | "project",
  projectPath?: string
): ClaudeAgent[] {
  if (!fs.existsSync(agentsDir)) return [];
  const agents: ClaudeAgent[] = [];
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const agentPath = path.join(agentsDir, entry.name);
      const content = fs.readFileSync(agentPath, "utf-8");
      const { name, description, tools, model } = parseAgentFrontmatter(content);
      const agentName = entry.name.replace(/\.md$/, "");
      agents.push({
        name: agentName,
        displayName: name || agentName,
        description,
        tools,
        model,
        content,
        scope,
        projectPath,
        agentPath,
      });
    }
  } catch (e) {
    console.error("[Agents] Read failed:", e);
  }
  return agents;
}

/**
 * Write an agent .md file
 * Creates: <agentsDir>/<agentName>.md
 */
function writeAgent(agentsDir: string, agentName: string, content: string): void {
  const agentPath = childPath(agentsDir, agentName, ".md");
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(agentPath, content, "utf-8");
}

/**
 * Delete an agent .md file
 */
function deleteAgent(agentsDir: string, agentName: string): void {
  const agentPath = childPath(agentsDir, agentName, ".md");
  if (fs.existsSync(agentPath)) {
    fs.unlinkSync(agentPath);
  }
}

/**
 * The real folder of a ~/.claude/projects/<encoded> directory. The encoding is
 * lossy (every non-alphanumeric character becomes "-"), so read the cwd that
 * Claude Code records inside the most recent transcript instead of decoding it.
 */
const projectPathCache = new Map<string, string>();
function realPathForProjectDir(projectDir: string, encodedName: string, sessionFiles: string[]): string {
  const cached = projectPathCache.get(projectDir);
  if (cached) return cached;
  const newestFirst = sessionFiles
    .map((f) => path.join(projectDir, f))
    .sort((a, b) => { try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; } });
  for (const file of newestFirst.slice(0, 3)) {
    let fd: number | null = null;
    try {
      fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(64 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const m = /"cwd":("(?:[^"\\]|\\.)*")/.exec(buf.subarray(0, n).toString("utf8"));
      if (m) {
        const cwd = JSON.parse(m[1]) as string;
        projectPathCache.set(projectDir, cwd);
        return cwd;
      }
    } catch {
      // try the next file
    } finally {
      if (fd !== null) try { fs.closeSync(fd); } catch {}
    }
  }
  const guessed = guessPathFromEncodedName(encodedName);
  if (guessed) projectPathCache.set(projectDir, guessed);
  return guessed ?? encodedName;
}

/**
 * Fallback for project folders with no transcripts: find an existing folder
 * whose encoding matches. Each "-" was a separator or one of - _ . space, so
 * try those, keeping only branches that exist on disk. Read-only.
 */
export function guessPathFromEncodedName(encoded: string, exists: (p: string) => boolean = fs.existsSync): string | null {
  let root: string;
  let rest: string;
  const drive = /^([A-Za-z])--(.*)$/.exec(encoded);
  if (drive) {
    root = `${drive[1].toUpperCase()}:\\`;
    rest = drive[2];
  } else if (encoded.startsWith("-")) {
    root = "/";
    rest = encoded.slice(1);
  } else {
    return null;
  }
  const tokens = rest.split("-");
  const joiners = ["-", "_", ".", " "];
  let budget = 2000; // bound the search on odd names
  // Folder name = tokens i..j joined by one joiner (mixed joiners inside one name aren't tried).
  const walk = (dir: string, i: number): string | null => {
    if (i >= tokens.length) return dir;
    for (let j = i; j < tokens.length; j++) {
      if (budget-- <= 0) return null;
      const names = j === i ? [tokens[i]] : joiners.map((jn) => tokens.slice(i, j + 1).join(jn));
      for (const name of names) {
        if (!name) continue;
        const next = path.join(dir, name);
        if (exists(next)) {
          const found = walk(next, j + 1);
          if (found) return found;
        }
      }
    }
    return null;
  };
  return walk(root, 0);
}

/**
 * Get all projects from ~/.claude/projects/
 */
function getTrackedProjects(): Array<{ encodedName: string; realPath: string; sessionCount: number }> {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  try {
    const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const projectDir = path.join(CLAUDE_PROJECTS_DIR, e.name);
        const sessionFiles = fs.existsSync(projectDir)
          ? fs.readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"))
          : [];
        return {
          encodedName: e.name,
          realPath: realPathForProjectDir(projectDir, e.name, sessionFiles),
          sessionCount: sessionFiles.length,
        };
      });
  } catch {
    return [];
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const agentsRouter = router({
  // ── Config ───────────────────────────────────────────────────────────────────
  getConfig: publicProcedure.query(() => loadConfig()),

  saveConfig: publicProcedure
    .input(z.object({
      claudeDir: z.string().optional(),
      watchedProjectPaths: z.array(z.string()).optional(),
      theme: z.enum(["dark", "light"]).optional(),
    }))
    .mutation(({ input }) => {
      const current = loadConfig();
      const updated: AppConfig = {
        ...current,
        ...(input.claudeDir !== undefined && { claudeDir: input.claudeDir }),
        ...(input.watchedProjectPaths !== undefined && { watchedProjectPaths: input.watchedProjectPaths }),
        ...(input.theme !== undefined && { theme: input.theme }),
      };
      saveConfig(updated);
      return { success: true, config: updated };
    }),

  // ── Connection Status ─────────────────────────────────────────────────────────
  connectionStatus: publicProcedure.query(() => {
    const claudeExists = fs.existsSync(CLAUDE_DIR);
    const projectsExists = fs.existsSync(CLAUDE_PROJECTS_DIR);
    const globalSkillsExists = fs.existsSync(GLOBAL_SKILLS_DIR);

    const projects = getTrackedProjects();
    const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);

    return {
      claudeDir: CLAUDE_DIR,
      claudeExists,
      projectsDir: CLAUDE_PROJECTS_DIR,
      projectsExists,
      globalSkillsDir: GLOBAL_SKILLS_DIR,
      globalSkillsExists,
      trackedProjects: projects.length,
      totalSessions,
      projects,
    };
  }),

  // ── Global Skills (real ~/.claude/skills/) ────────────────────────────────────
  globalSkills: publicProcedure.query(() => {
    return readSkillsFromDir(GLOBAL_SKILLS_DIR, "global");
  }),

  createGlobalSkill: publicProcedure
    .input(z.object({
      skillName: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Skill name must be lowercase letters, numbers, hyphens, or underscores"),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      writeSkill(GLOBAL_SKILLS_DIR, input.skillName, input.content);
      return { success: true };
    }),

  updateGlobalSkill: publicProcedure
    .input(z.object({
      skillName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      writeSkill(GLOBAL_SKILLS_DIR, input.skillName, input.content);
      return { success: true };
    }),

  deleteGlobalSkill: publicProcedure
    .input(z.object({ skillName: z.string() }))
    .mutation(({ input }) => {
      deleteSkill(GLOBAL_SKILLS_DIR, input.skillName);
      return { success: true };
    }),

  // ── Project Skills (real <project>/.claude/skills/) ───────────────────────────
  projectSkills: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      return readSkillsFromDir(skillsDir, "project", input.projectPath);
    }),

  createProjectSkill: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      skillName: z.string().min(1).regex(/^[a-z0-9-_]+$/),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      writeSkill(skillsDir, input.skillName, input.content);
      return { success: true };
    }),

  updateProjectSkill: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      skillName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      writeSkill(skillsDir, input.skillName, input.content);
      return { success: true };
    }),

  deleteProjectSkill: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      skillName: z.string(),
    }))
    .mutation(({ input }) => {
      const skillsDir = path.join(input.projectPath, ".claude", "skills");
      deleteSkill(skillsDir, input.skillName);
      return { success: true };
    }),

  // ── All Projects ──────────────────────────────────────────────────────────────
  trackedProjects: publicProcedure.query(() => getTrackedProjects()),

  // ── Global Agents (~/.claude/agents/) ────────────────────────────────────────
  globalAgents: publicProcedure.query(() => {
    const agentsDir = path.join(CLAUDE_DIR, "agents");
    return readAgentsFromDir(agentsDir, "global");
  }),

  createGlobalAgent: publicProcedure
    .input(z.object({
      agentName: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Agent name must be lowercase letters, numbers, hyphens, or underscores"),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(CLAUDE_DIR, "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  updateGlobalAgent: publicProcedure
    .input(z.object({
      agentName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(CLAUDE_DIR, "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  deleteGlobalAgent: publicProcedure
    .input(z.object({ agentName: z.string() }))
    .mutation(({ input }) => {
      const agentsDir = path.join(CLAUDE_DIR, "agents");
      deleteAgent(agentsDir, input.agentName);
      return { success: true };
    }),

  // ── Project Agents (<project>/.claude/agents/) ────────────────────────────────
  projectAgents: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      return readAgentsFromDir(agentsDir, "project", input.projectPath);
    }),

  createProjectAgent: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      agentName: z.string().min(1).regex(/^[a-z0-9-_]+$/),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  updateProjectAgent: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      agentName: z.string(),
      content: z.string().min(1),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      writeAgent(agentsDir, input.agentName, input.content);
      return { success: true };
    }),

  deleteProjectAgent: publicProcedure
    .input(z.object({
      projectPath: z.string(),
      agentName: z.string(),
    }))
    .mutation(({ input }) => {
      const agentsDir = path.join(input.projectPath, ".claude", "agents");
      deleteAgent(agentsDir, input.agentName);
      return { success: true };
    }),

  // ── Bridge API Key ────────────────────────────────────────────────────────────
  bridgeApiKey: publicProcedure.query(() => {
    // Use the same getOrCreateApiKey from bridge.ts to ensure consistency
    const apiKey = getOrCreateApiKey();
    return { apiKey, exists: true };
  }),
});
