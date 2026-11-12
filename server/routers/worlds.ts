import { publicProcedure, router } from "../_core/trpc";
import { characterManager, worldManager } from "../worlds";
import { BUILTIN_WORLDS_DIR, USER_CHARACTERS_DIR, USER_WORLDS_DIR } from "../worlds/manager";

export const worldsRouter = router({
  state: publicProcedure.query(() => worldManager.state),
  characters: publicProcedure.query(() => characterManager.state),
  folders: publicProcedure.query(() => ({ builtin: BUILTIN_WORLDS_DIR, user: USER_WORLDS_DIR, userCharacters: USER_CHARACTERS_DIR })),
});
