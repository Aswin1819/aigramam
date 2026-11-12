import { router } from "./_core/trpc";
import { agentsRouter } from "./routers/agents";
import { gitRouter } from "./routers/git";
import { hooksRouter } from "./routers/hooks";
import { worldsRouter } from "./routers/worlds";

export const appRouter = router({
  agents: agentsRouter,
  git: gitRouter,
  hooks: hooksRouter,
  worlds: worldsRouter,
});

export type AppRouter = typeof appRouter;
