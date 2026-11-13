/**
 * History router: completed and current sessions counted from Claude Code's
 * transcripts, and one session's recorded timeline. Read-only. The browser
 * names a session id; the file always comes from the index.
 */
import os from "os";
import path from "path";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { HistoryIndex } from "../history";
import { readTimeline } from "../history/timeline";

const sessionId = z.string().regex(/^[0-9a-f-]{36}$/i);

export function createHistoryRouter(index: HistoryIndex) {
  return router({
    /** Everything counted so far; starts (or continues) reading new and grown transcripts in the background. */
    list: publicProcedure.query(() => {
      void index.refresh();
      return index.list();
    }),
    timeline: publicProcedure.input(z.object({ sessionId })).query(async ({ input }) => {
      let file = index.fileOf(input.sessionId);
      if (!file) {
        await index.refresh(true);
        file = index.fileOf(input.sessionId);
      }
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "No transcript for that session" });
      return readTimeline(file, input.sessionId.toLowerCase());
    }),
  });
}

/** The app's index over ~/.claude/projects; live ids come from the monitor, loaded on first use so importing the router (in tests) doesn't start it. */
let liveIds: (() => Set<string>) | null = null;
let loading = false;
function currentLiveIds(): Set<string> {
  if (!liveIds && !loading) {
    loading = true;
    void import("../websocket").then((m) => (liveIds = m.liveSessionIds)).catch(() => {});
  }
  return liveIds?.() ?? new Set();
}

export const historyIndex = new HistoryIndex({
  projectsDir: path.join(os.homedir(), ".claude", "projects"),
  liveIds: currentLiveIds,
});
export const historyRouter = createHistoryRouter(historyIndex);
