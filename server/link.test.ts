import { describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { Link, LINK_HEADER, sanitizeQuestions } from "./link/link";
import type { HookPayload } from "./monitor/store";

const SID = "11111111-2222-4333-8444-555555555555";
const make = () => {
  const events: HookPayload[] = [];
  const link = new Link(() => "k".repeat(48), (p) => events.push(p), (tool) => `Running ${tool}`);
  return { link, events };
};

describe("Link (browser ↔ mod)", () => {
  it("only queues messages for a session whose mod is checking in", () => {
    const { link } = make();
    expect(link.queueMessage(SID, "hi")).toMatchObject({ ok: false });
    link.takeInbox(SID); // the mod checks in
    expect(link.queueMessage(SID, "   ")).toMatchObject({ ok: false, error: expect.stringMatching(/empty/) });
    expect(link.queueMessage(SID, "x".repeat(9000))).toMatchObject({ ok: false });
    expect(link.queueMessage(SID, "run the tests")).toEqual({ ok: true });
    expect(link.queueStop(SID)).toEqual({ ok: true });
    expect(link.info(SID)).toMatchObject({ connected: true, queued: 1 });
    const got = link.takeInbox(SID);
    expect(got.map((c) => c.type)).toEqual(["prompt", "stop"]);
    expect(got[0]).toMatchObject({ text: "run the tests" });
    expect(link.takeInbox(SID)).toEqual([]);
    expect(link.info(SID)?.queued).toBe(0);
  });

  it("caps the queue", () => {
    const { link } = make();
    link.takeInbox(SID);
    for (let i = 0; i < 20; i++) expect(link.queueMessage(SID, `m${i}`).ok).toBe(true);
    expect(link.queueMessage(SID, "one too many").ok).toBe(false);
  });

  it("round-trips an approval: open, wait, decide in the browser", async () => {
    const { link } = make();
    const a = link.openApproval(SID, "Bash", { command: "git push" });
    expect(link.info(SID)?.approval).toMatchObject({ id: a.id, tool: "Bash", label: "Running Bash" });
    const waiting = link.waitApproval(a.id, 5000);
    expect(link.decide(a.id, "allow").ok).toBe(true);
    expect(await waiting).toEqual({ decision: "allow" });
    expect(link.decide(a.id, "deny").ok).toBe(false); // already answered
    expect(link.info(SID)?.approval).toBeUndefined();
  });

  it("times out to null and forgets requests the mod closed", async () => {
    const { link } = make();
    const a = link.openApproval(SID, "Bash", {});
    expect(await link.waitApproval(a.id, 30)).toBeNull();
    const b = link.openApproval(SID, "Write", {});
    expect(link.info(SID)?.approval?.id).toBe(b.id); // the new one replaced the unanswered one
    expect(link.decide(a.id, "allow").ok).toBe(false);
    const w = link.waitApproval(b.id, 5000);
    link.closeApproval(b.id);
    expect(await w).toBeNull();
    expect(link.decide(b.id, "allow").ok).toBe(false);
  });

  const ASK = {
    questions: [
      { question: "Which colour?", header: "Colour", multiSelect: false, options: [{ label: "Red", description: "warm" }, { label: "Blue" }], preview: "x".repeat(10) },
      { question: "Which extras?", header: "Extras", multiSelect: true, options: [{ label: "Tests" }, { label: "Docs" }] },
    ],
  };

  it("offers an AskUserQuestion to the browser and returns the answers", async () => {
    const { link } = make();
    const a = link.openApproval(SID, "AskUserQuestion", ASK);
    const info = link.info(SID)?.approval;
    expect(info?.label).toBe("Which colour?");
    expect(info?.questions).toEqual([
      { question: "Which colour?", header: "Colour", multiSelect: false, options: [{ label: "Red", description: "warm" }, { label: "Blue" }] },
      { question: "Which extras?", header: "Extras", multiSelect: true, options: [{ label: "Tests" }, { label: "Docs" }] },
    ]);
    const waiting = link.waitApproval(a.id, 5000);
    expect(link.decide(a.id, "allow").ok).toBe(false); // answers are required
    expect(link.decide(a.id, "allow", { "Not asked?": "Red" }).ok).toBe(false); // only asked questions
    expect(link.decide(a.id, "allow", { "Which colour?": "Red", "Which extras?": "Tests, Docs" }).ok).toBe(true);
    expect(await waiting).toEqual({ decision: "allow", answers: { "Which colour?": "Red", "Which extras?": "Tests, Docs" } });
  });

  it("hands a question back to the terminal on deny", async () => {
    const { link } = make();
    const a = link.openApproval(SID, "AskUserQuestion", ASK);
    const waiting = link.waitApproval(a.id, 5000);
    expect(link.decide(a.id, "deny").ok).toBe(true);
    expect(await waiting).toEqual({ decision: "deny" });
  });

  it("bounds what an AskUserQuestion input can put on the page", () => {
    expect(sanitizeQuestions(null)).toBeUndefined();
    expect(sanitizeQuestions({ questions: "nope" })).toBeUndefined();
    const big = sanitizeQuestions({ questions: Array.from({ length: 9 }, (_, i) => ({ question: `${"q".repeat(900)}${i}`, header: "h".repeat(90), options: Array.from({ length: 9 }, () => ({ label: "l".repeat(400) })) })) })!;
    expect(big).toHaveLength(4);
    expect(big[0]!.question).toHaveLength(500);
    expect(big[0]!.header).toHaveLength(40);
    expect(big[0]!.options).toHaveLength(6);
    expect(big[0]!.options[0]!.label).toHaveLength(120);
  });

  it("HTTP API: needs the key, forwards events, serves the inbox and approvals", async () => {
    const { link, events } = make();
    const app = express();
    app.use(express.json());
    app.use("/api/link", link.router());
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/link`;
    const H = { "content-type": "application/json", [LINK_HEADER]: "k".repeat(48) };
    try {
      expect((await fetch(`${base}/inbox?session=${SID}`)).status).toBe(403);
      expect((await fetch(`${base}/inbox?session=${SID}`, { headers: { [LINK_HEADER]: "wrong" } })).status).toBe(403);
      expect((await fetch(`${base}/inbox?session=../etc`, { headers: H })).status).toBe(400);

      const ev = await fetch(`${base}/events`, { method: "POST", headers: H, body: JSON.stringify({ sessionId: SID, events: [{ hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "t1", session_id: "spoofed" }] }) });
      expect(ev.status).toBe(200);
      expect(events).toEqual([{ hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "t1", session_id: SID }]);

      link.queueMessage(SID, "hello from the browser");
      const inbox = await (await fetch(`${base}/inbox?session=${SID}`, { headers: H })).json();
      expect(inbox.commands[0]).toMatchObject({ type: "prompt", text: "hello from the browser" });

      const { id } = await (await fetch(`${base}/approvals`, { method: "POST", headers: H, body: JSON.stringify({ sessionId: SID, tool: "Bash", input: { command: "npm publish" } }) })).json();
      const pending = fetch(`${base}/approvals/${id}?wait=5000`, { headers: H }).then((r) => r.json());
      await new Promise((r) => setTimeout(r, 50));
      link.decide(id, "deny");
      expect(await pending).toEqual({ decision: "deny" });

      const q = await (await fetch(`${base}/approvals`, { method: "POST", headers: H, body: JSON.stringify({ sessionId: SID, tool: "AskUserQuestion", input: ASK }) })).json();
      const answered = fetch(`${base}/approvals/${q.id}?wait=5000`, { headers: H }).then((r) => r.json());
      await new Promise((r) => setTimeout(r, 50));
      link.decide(q.id, "allow", { "Which colour?": "Blue" });
      expect(await answered).toEqual({ decision: "allow", answers: { "Which colour?": "Blue" } });
      expect((await fetch(`${base}/approvals/${id}`, { method: "DELETE", headers: H })).status).toBe(200);
    } finally {
      server.close();
    }
  });
});
