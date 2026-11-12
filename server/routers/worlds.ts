import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { characterAssignments, characterManager, worldManager } from "../worlds";
import { BUILTIN_WORLDS_DIR, USER_CHARACTERS_DIR, USER_WORLDS_DIR } from "../worlds/manager";
import { appRoot } from "../packs/manager";

export const worldsRouter = router({
  state: publicProcedure.query(() => worldManager.state),
  characters: publicProcedure.query(() => characterManager.state),
  /** Choose the character a project's sessions appear as (null = back to automatic). */
  assignCharacter: publicProcedure
    .input(z.object({ projectId: z.string().min(1).max(1000), characterId: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable() }))
    .mutation(({ input }) => ({ ok: characterAssignments.set(input.projectId, input.characterId) })),
  folders: publicProcedure.query(() => ({ builtin: BUILTIN_WORLDS_DIR, user: USER_WORLDS_DIR, userCharacters: USER_CHARACTERS_DIR, app: appRoot() })),
});
