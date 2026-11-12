import { router } from "./_core/trpc";
import { agentsRouter } from "./routers/agents";
import { hooksRouter } from "./routers/hooks";

export const appRouter = router({
  agents: agentsRouter,
  hooks: hooksRouter,
});

export type AppRouter = typeof appRouter;
