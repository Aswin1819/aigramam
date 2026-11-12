import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { agentsRouter, createAgentsRouter } from "./routers/agents";

const ctx = { req: {} as never, res: {} as never };

/** Every file under a folder, relative, with its content, to detect any write. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

describe("agents router is read-only", () => {
  it("exposes no write procedures for skills or agents", () => {
    const procs = agentsRouter._def.procedures as Record<string, { _def: { type: string } }>;
    const names = Object.keys(procs);
    expect(names).toEqual(expect.arrayContaining(["globalSkills", "projectSkills", "globalAgents", "projectAgents", "trackedProjects", "connectionStatus"]));
    for (const n of names) expect(n).not.toMatch(/^(create|update|delete|write|remove|save)(Global|Project)(Skill|Agent)/i);
    // The only mutation left is the app's own config in ~/.ai-gramam.
    const mutations = names.filter((n) => procs[n]._def.type === "mutation");
    expect(mutations).toEqual(["saveConfig"]);
  });

  describe("against a temp ~/.claude", () => {
    let root: string;
    let claudeDir: string;
    let project: string;
    let other: string;

    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "aig-agents-"));
      claudeDir = path.join(root, ".claude");
      project = path.join(root, "my-project");
      other = path.join(root, "not-tracked");
      fs.mkdirSync(path.join(claudeDir, "skills", "greet"), { recursive: true });
      fs.writeFileSync(path.join(claudeDir, "skills", "greet", "SKILL.md"), "---\nname: Greeter\ndescription: Says hello\n---\nHi");
      fs.mkdirSync(path.join(claudeDir, "agents"), { recursive: true });
      fs.writeFileSync(path.join(claudeDir, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Reviews code\ntools: Read, Grep\nmodel: sonnet\n---\nReview.");
      fs.mkdirSync(path.join(project, ".claude", "skills", "build"), { recursive: true });
      fs.writeFileSync(path.join(project, ".claude", "skills", "build", "SKILL.md"), "---\nname: build\ndescription: Builds it\n---\n");
      fs.mkdirSync(path.join(project, ".claude", "agents"), { recursive: true });
      fs.writeFileSync(path.join(project, ".claude", "agents", "tester.md"), "---\ndescription: Runs tests\n---\n");
      fs.mkdirSync(path.join(other, ".claude", "skills", "secret"), { recursive: true });
      fs.writeFileSync(path.join(other, ".claude", "skills", "secret", "SKILL.md"), "---\nname: secret\n---\n");
      const enc = path.join(claudeDir, "projects", "enc-my-project");
      fs.mkdirSync(enc, { recursive: true });
      fs.writeFileSync(path.join(enc, "s1.jsonl"), JSON.stringify({ type: "user", cwd: project }) + "\n");
    });

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it("lists global and project skills and agents without changing any file", async () => {
      const before = { claude: snapshot(claudeDir), project: snapshot(project) };
      const caller = createAgentsRouter({ claudeDir }).createCaller(ctx);

      const skills = await caller.globalSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0]).toMatchObject({ name: "greet", displayName: "Greeter", description: "Says hello", scope: "global" });

      const agents = await caller.globalAgents();
      expect(agents[0]).toMatchObject({ name: "reviewer", tools: "Read, Grep", model: "sonnet", description: "Reviews code" });

      const tracked = await caller.trackedProjects();
      expect(tracked).toEqual([{ encodedName: "enc-my-project", realPath: project, sessionCount: 1 }]);

      const pSkills = await caller.projectSkills({ projectPath: project });
      expect(pSkills.map((s) => s.name)).toEqual(["build"]);
      const pAgents = await caller.projectAgents({ projectPath: project });
      expect(pAgents[0]).toMatchObject({ name: "tester", description: "Runs tests", scope: "project" });

      expect({ claude: snapshot(claudeDir), project: snapshot(project) }).toEqual(before);
    });

    it("rejects project paths that are relative or not tracked", async () => {
      const caller = createAgentsRouter({ claudeDir }).createCaller(ctx);
      await expect(caller.projectSkills({ projectPath: other })).rejects.toThrow(/Not a project/);
      await expect(caller.projectAgents({ projectPath: "relative/path" })).rejects.toThrow(/absolute/);
      await expect(caller.projectSkills({ projectPath: path.join(project, "..", "not-tracked") })).rejects.toThrow(/Not a project/);
    });
  });
});
