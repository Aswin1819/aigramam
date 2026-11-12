/**
 * Git router — READ-ONLY status and diffs for a project the monitor knows.
 *
 * The browser sends a projectId, never a path: the folder comes from the live
 * snapshot, so the server can't be pointed at an arbitrary directory. A diff's
 * `file` must be one of the changes `git status` reports for that project.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { ProjectView } from "@shared/model";
import { publicProcedure, router } from "../_core/trpc";
import { gitDiff, gitStatus, isSafeRepoPath, type GitOptions } from "../git/status";

export interface GitRouterOptions extends GitOptions {
  /** The projects the monitor currently knows. */
  projects: () => ProjectView[] | Promise<ProjectView[]>;
}

const projectId = z.string().min(1).max(512);

export function createGitRouter(opts: GitRouterOptions) {
  const { projects, ...gitOpts } = opts;
  const rootOf = async (id: string): Promise<string> => {
    const p = (await projects()).find((x) => x.id === id);
    if (!p || !p.root) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown project" });
    return p.root;
  };

  return router({
    status: publicProcedure
      .input(z.object({ projectId }))
      .query(async ({ input }) => gitStatus(await rootOf(input.projectId), gitOpts)),

    diff: publicProcedure
      .input(z.object({ projectId, file: z.string().min(1).max(4096), staged: z.boolean() }))
      .query(async ({ input }) => {
        const root = await rootOf(input.projectId);
        if (!isSafeRepoPath(input.file)) throw new TRPCError({ code: "BAD_REQUEST", message: "Not a changed file in this project" });
        const r = await gitDiff(root, input.file, input.staged, gitOpts);
        // gitDiff re-runs status and only accepts a path it lists.
        if (!r.available && r.reason === "error" && r.message === "Not a changed file in this project.") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Not a changed file in this project" });
        }
        return r;
      }),
  });
}

/** The app's router: projects from the live monitor (loaded lazily so tests importing routers don't start it). */
export const gitRouter = createGitRouter({
  projects: async () => (await import("../websocket")).liveProjects(),
});
