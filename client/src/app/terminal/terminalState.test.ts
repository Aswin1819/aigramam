import { describe, expect, it } from "vitest";
import { TERMINAL_LIMITS, type TerminalInfo } from "@shared/terminal";
import { chunkInput, claudeLinkOf, neighbourAfterClose, resolveActive, terminalBlockedReason, terminalStatusText } from "./terminalState";

const t = (id: string, extra: Partial<TerminalInfo> = {}): TerminalInfo => ({
  id,
  projectId: "p",
  projectName: "proj",
  cwd: "C:\\proj",
  shell: "powershell.exe",
  pid: 1,
  createdAt: 0,
  status: "running",
  sessionIds: [],
  ...extra,
});

describe("resolveActive", () => {
  it("is null with no terminals", () => expect(resolveActive([], "a")).toBeNull());
  it("keeps the chosen terminal", () => expect(resolveActive([t("a"), t("b")], "a")?.id).toBe("a"));
  it("falls back to the newest when the chosen one is gone or unset", () => {
    expect(resolveActive([t("a"), t("b")], "gone")?.id).toBe("b");
    expect(resolveActive([t("a"), t("b")], null)?.id).toBe("b");
  });
});

describe("neighbourAfterClose", () => {
  const list = [t("a"), t("b"), t("c")];
  it("shows the next tab", () => expect(neighbourAfterClose(list, "b")).toBe("c"));
  it("shows the previous tab when the last one closes", () => expect(neighbourAfterClose(list, "c")).toBe("b"));
  it("is null when the only tab closes", () => expect(neighbourAfterClose([t("a")], "a")).toBeNull());
  it("falls back to the newest for an unknown id", () => expect(neighbourAfterClose(list, "x")).toBe("c"));
});

describe("terminalBlockedReason", () => {
  it("blocks the demo", () => expect(terminalBlockedReason("demo", true)).toMatch(/Switch to Live/));
  it("blocks while disconnected", () => expect(terminalBlockedReason("live", false)).toMatch(/Not connected/));
  it("blocks at the limit", () => expect(terminalBlockedReason("live", true, TERMINAL_LIMITS.maxOpen)).toMatch(/At most/));
  it("allows otherwise", () => expect(terminalBlockedReason("live", true, 1)).toBeNull());
});

describe("chunkInput", () => {
  it("passes small input through and drops empty input", () => {
    expect(chunkInput("dir\r")).toEqual(["dir\r"]);
    expect(chunkInput("")).toEqual([]);
  });
  it("splits a large paste under the byte limit, keeping the text", () => {
    const big = "é".repeat(40_000);
    const parts = chunkInput(big);
    expect(parts.join("")).toBe(big);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(TERMINAL_LIMITS.maxInputBytes);
  });
  it("never splits a surrogate pair", () => {
    const s = "a" + "😀".repeat(10);
    const parts = chunkInput(s, 4);
    expect(parts.join("")).toBe(s);
    for (const p of parts) expect(p).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
  });
});

describe("terminalStatusText", () => {
  it("says running or the exit code", () => {
    expect(terminalStatusText(t("a"))).toBe("Running");
    expect(terminalStatusText(t("a", { status: "exited", exitCode: 4 }))).toBe("Exited (code 4)");
  });
});

describe("claudeLinkOf", () => {
  const sessions = [{ id: "s1", title: "Fix the login" }];
  it("names the linked session", () =>
    expect(claudeLinkOf(t("a", { sessionIds: ["s1"] }), sessions, 0)).toEqual({ kind: "linked", sessionId: "s1", title: "Fix the login", more: 0 }));
  it("falls back to the id when the session isn't in the snapshot yet", () =>
    expect(claudeLinkOf(t("a", { sessionIds: ["abcdef1234", "s1"] }), sessions, 0)).toMatchObject({ title: "Session abcdef12", more: 1 }));
  it("says starting only briefly, only for Claude terminals that are running", () => {
    const c = t("a", { started: "claude", createdAt: 1000 });
    expect(claudeLinkOf(c, sessions, 2000, 5000)).toEqual({ kind: "starting" });
    expect(claudeLinkOf(c, sessions, 7000, 5000)).toBeNull();
    expect(claudeLinkOf({ ...c, status: "exited" }, sessions, 2000, 5000)).toBeNull();
    expect(claudeLinkOf(t("b"), sessions, 0)).toBeNull();
  });
});
