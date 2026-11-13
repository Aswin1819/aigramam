import { router } from "./_core/trpc";
import { agentsRouter } from "./routers/agents";
import { gitRouter } from "./routers/git";
import { historyRouter } from "./routers/history";
import { hooksRouter } from "./routers/hooks";
import { projectsRouter } from "./routers/projects";
import { worldsRouter } from "./routers/worlds";

export const appRouter = router({
  agents: agentsRouter,
  git: gitRouter,
  history: historyRouter,
  hooks: hooksRouter,
  projects: projectsRouter,
  worlds: worldsRouter,
});

export type AppRouter = typeof appRouter;
