/**
 * Install / uninstall our HTTP hooks in ~/.claude/settings.json.
 * Nothing changes until the user confirms in the UI after seeing the preview.
 * A backup of the previous file is saved in ~/.claude-dungeon/backups first.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { runtime } from "../_core/runtime";
import { getOrCreateHookKey, HooksInstaller, HOOK_EVENTS, hookUrl } from "../monitor/hooks";
import { setHooksInstalled } from "../websocket";

const installer = new HooksInstaller();
const mode = z.object({ mode: z.enum(["install", "uninstall"]) });

function fail(e: unknown): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: `Can't update ${installer.settingsPath}: ${(e as Error).message}` });
}

export const hooksRouter = router({
  status: publicProcedure.query(() => ({
    ...installer.status(runtime.port),
    url: hookUrl(runtime.port),
    events: [...HOOK_EVENTS],
  })),

  preview: publicProcedure.input(mode).query(({ input }) => {
    try {
      return installer.preview(runtime.port, getOrCreateHookKey(), input.mode);
    } catch (e) {
      fail(e);
    }
  }),

  change: publicProcedure.input(mode).mutation(({ input }) => {
    try {
      const result = installer.apply(runtime.port, getOrCreateHookKey(), input.mode);
      const status = installer.status(runtime.port);
      setHooksInstalled(status.installed);
      return { ...result, installed: status.installed };
    } catch (e) {
      fail(e);
    }
  }),
});
