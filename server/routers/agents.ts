/**
 * Agents Router - READ-ONLY view of Claude Code skills/agents, plus app config
 * (in ~/.ai-gramam) and connection status.
 *
 * Claude Code file structure:
 *   Transcripts: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *   Global skills: ~/.claude/skills/<skill-name>/SKILL.md
 *   Project skills: <project>/.claude/skills/<skill-name>/SKILL.md
 *   Global agents: ~/.claude/agents/<agent-name>.md
 *   Project agents: <project>/.claude/agents/<agent-name>.md
 *
 * Nothing here writes, creates or deletes anything in ~/.claude or in a
 * project's .claude/ folder. Edit skills and agents in Claude Code or an editor.
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import fs from "fs";
import path from "path";
import os from "os";
import { getOrCreateApiKey } from "../bridge";
import { TRPCError } from "@trpc/server";

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
import { DATA_DIR } from "../_core/paths";
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
function getTrackedProjects(projectsDir: string = CLAUDE_PROJECTS_DIR): Array<{ encodedName: string; realPath: string; sessionCount: number }> {
  if (!fs.existsSync(projectsDir)) return [];
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const projectDir = path.join(projectsDir, e.name);
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

/**
 * Path safety for the project-scoped reads: the path must be absolute and be
 * one of the projects Claude Code tracks (from ~/.claude/projects), so the
 * browser can't make the server list arbitrary folders.
 */
function samePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === "win32" ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

function trackedProjectPath(projectsDir: string, projectPath: string): string {
  if (!path.isAbsolute(projectPath) || projectPath.includes(String.fromCharCode(0))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Project path must be absolute" });
  }
  const match = getTrackedProjects(projectsDir).find((p) => path.isAbsolute(p.realPath) && samePath(p.realPath, projectPath));
  if (!match) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Not a project Claude Code has been used in" });
  }
  return path.resolve(match.realPath);
}

const projectInput = z.object({ projectPath: z.string().min(1).max(1024) });

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Read-only router. `claudeDir` can be injected (tests point it at a temp
 * folder); the app uses ~/.claude.
 */
export function createAgentsRouter(opts: { claudeDir?: string } = {}) {
  const claudeDir = opts.claudeDir ?? CLAUDE_DIR;
  const projectsDir = path.join(claudeDir, "projects");
  const globalSkillsDir = path.join(claudeDir, "skills");
  const globalAgentsDir = path.join(claudeDir, "agents");

  return router({
    // ── Config (~/.ai-gramam/config.json, never ~/.claude) ─────────────────────
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

    // ── Connection Status ───────────────────────────────────────────────────────
    connectionStatus: publicProcedure.query(() => {
      const projects = getTrackedProjects(projectsDir);
      const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);
      return {
        claudeDir,
        claudeExists: fs.existsSync(claudeDir),
        projectsDir,
        projectsExists: fs.existsSync(projectsDir),
        globalSkillsDir,
        globalSkillsExists: fs.existsSync(globalSkillsDir),
        trackedProjects: projects.length,
        totalSessions,
        projects,
      };
    }),

    // ── Skills (read-only) ──────────────────────────────────────────────────────
    globalSkills: publicProcedure.query(() => readSkillsFromDir(globalSkillsDir, "global")),

    projectSkills: publicProcedure
      .input(projectInput)
      .query(({ input }) => {
        const project = trackedProjectPath(projectsDir, input.projectPath);
        return readSkillsFromDir(path.join(project, ".claude", "skills"), "project", project);
      }),

    // ── All Projects ────────────────────────────────────────────────────────────
    trackedProjects: publicProcedure.query(() => getTrackedProjects(projectsDir)),

    // ── Agents (read-only) ──────────────────────────────────────────────────────
    globalAgents: publicProcedure.query(() => readAgentsFromDir(globalAgentsDir, "global")),

    projectAgents: publicProcedure
      .input(projectInput)
      .query(({ input }) => {
        const project = trackedProjectPath(projectsDir, input.projectPath);
        return readAgentsFromDir(path.join(project, ".claude", "agents"), "project", project);
      }),

    // ── Bridge API Key (stored in ~/.ai-gramam) ─────────────────────────────────
    bridgeApiKey: publicProcedure.query(() => {
      const apiKey = getOrCreateApiKey();
      return { apiKey, exists: true };
    }),
  });
}

export const agentsRouter = createAgentsRouter();
