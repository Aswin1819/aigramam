import { publicProcedure, router } from "../_core/trpc";
import { worldManager } from "../worlds";
import { BUILTIN_WORLDS_DIR, USER_WORLDS_DIR } from "../worlds/manager";

export const worldsRouter = router({
  state: publicProcedure.query(() => worldManager.state),
  folders: publicProcedure.query(() => ({ builtin: BUILTIN_WORLDS_DIR, user: USER_WORLDS_DIR })),
});
