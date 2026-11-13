/**
 * Setup checks router: is the mod installed, which version, how many sessions
 * are linked and live. Read-only.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { publicProcedure, router } from "../_core/trpc";
import { appRoot } from "../packs/manager";
import { readModInstall, readShippedVersion } from "../setup/status";
import type { SetupStatus } from "@shared/setup";

export interface SetupDeps {
  claudeDir: string;
  appRoot: string;
  /** Link summary and live session count; loaded lazily so importing the router doesn't start the monitor. */
  live: () => Promise<{ link: SetupStatus["link"]; liveSessions: number }>;
}

export function setupStatus(d: { claudeDir: string; appRoot: string }, live: { link: SetupStatus["link"]; liveSessions: number }): SetupStatus {
  return {
    shippedVersion: readShippedVersion(d.appRoot),
    mod: readModInstall(d.claudeDir),
    link: live.link,
    liveSessions: live.liveSessions,
    claudeFolderFound: fs.existsSync(d.claudeDir),
  };
}

export function createSetupRouter(deps: SetupDeps) {
  return router({
    status: publicProcedure.query(async () => setupStatus(deps, await deps.live())),
  });
}

export const setupRouter = createSetupRouter({
  claudeDir: path.join(os.homedir(), ".claude"),
  appRoot: appRoot(),
  live: async () => {
    const m = await import("../websocket");
    return { link: m.link.summary(), liveSessions: m.liveSessionIds().size };
  },
});
