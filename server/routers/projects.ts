/**
 * Project shortcuts: open a project folder in File Explorer or an editor.
 * The folder always comes from the live project list, never from the browser.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { OPEN_APPS, availableApps, openFolder } from "../projects/open";

/** Loaded lazily so importing the router (in tests) doesn't start the monitor. */
async function projectRoot(projectId: string): Promise<string> {
  const { liveProjects } = await import("../websocket");
  const p = liveProjects().find((x) => x.id === projectId);
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown project" });
  return p.root;
}

export const projectsRouter = router({
  /** Which apps can open folders here (so buttons can say what's missing). */
  apps: publicProcedure.query(() => availableApps()),
  open: publicProcedure
    .input(z.object({ projectId: z.string().min(1).max(1000), app: z.enum(OPEN_APPS as [string, ...string[]]) }))
    .mutation(async ({ input }) => openFolder(await projectRoot(input.projectId), input.app as (typeof OPEN_APPS)[number])),
});
