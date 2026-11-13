import { describe, expect, it } from "vitest";
import type { SetupStatus } from "@shared/setup";
import { setupChecks, worstLevel } from "./checkList";

function status(over: Partial<SetupStatus> = {}): SetupStatus {
  return {
    shippedVersion: "0.3.0",
    mod: { state: "installed", installs: [{ version: "0.3.0", scope: "user" }] },
    link: { linkedNow: 2, versions: ["0.3.0"], lastContactAt: 1, lastVersion: "0.3.0" },
    liveSessions: 2,
    claudeFolderFound: true,
    ...over,
  };
}
const find = (c: ReturnType<typeof setupChecks>, id: string) => c.find((x) => x.id === id)!;

describe("setup checks", () => {
  it("an unreachable server is one clear problem, not 'no sessions'", () => {
    const c = setupChecks(false, status());
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: "server", level: "bad" });
    expect(c[0]!.title).toContain("not reachable");
  });

  it("all good when installed, current and every session is linked", () => {
    const c = setupChecks(true, status());
    expect(c.map((x) => x.id)).toEqual(["server", "claude", "mod", "link"]);
    expect(worstLevel(c)).toBe("ok");
  });

  it("tells apart: not installed, no sessions, partly linked, outdated, run from a folder", () => {
    const notInstalled = setupChecks(true, status({ mod: { state: "not_installed", installs: [] }, link: { linkedNow: 0, versions: [], lastContactAt: null, lastVersion: null } }));
    expect(find(notInstalled, "mod")).toMatchObject({ level: "warn", title: "Ai Gramam mod: not installed" });
    expect(find(notInstalled, "link")).toMatchObject({ level: "info", title: "Linked: 0 of 2" });

    const none = setupChecks(true, status({ liveSessions: 0, link: { linkedNow: 0, versions: [], lastContactAt: null, lastVersion: null } }));
    expect(find(none, "claude")).toMatchObject({ level: "info", title: "Claude Code: no sessions running" });
    expect(none.some((x) => x.id === "link")).toBe(false);

    const partly = setupChecks(true, status({ liveSessions: 3 }));
    expect(find(partly, "link")).toMatchObject({ level: "warn", title: "Linked: 2 of 3" });

    const outdated = setupChecks(true, status({ mod: { state: "installed", installs: [{ version: "0.2.0", scope: "user" }] } }));
    expect(find(outdated, "mod")).toMatchObject({ level: "warn", title: "Ai Gramam mod: update available" });

    const devFolder = setupChecks(true, status({ mod: { state: "not_installed", installs: [] } }));
    expect(find(devFolder, "mod")).toMatchObject({ level: "ok", title: "Ai Gramam mod: running, not installed" });

    const oldSessions = setupChecks(true, status({ link: { linkedNow: 2, versions: ["0.2.0", "0.3.0"], lastContactAt: 1, lastVersion: "0.3.0" } }));
    expect(oldSessions.find((x) => x.title === "Some sessions run an older mod")?.level).toBe("warn");

    const noClaude = setupChecks(true, status({ claudeFolderFound: false, liveSessions: 0 }));
    expect(find(noClaude, "claude").level).toBe("bad");
  });
});
