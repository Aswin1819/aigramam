import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { BIND_HOST, hostAndOriginGuard, localOnly } from "./security";
import { isProduction, runtime } from "./runtime";
import { initializeWebSocket, getBroadcastCallbacks, handleHook, setHooksInstalled, link } from "../websocket";
import { LINK_PATH } from "../link/link";
import { createBridgeRouter } from "../bridge";
import { createHooksRouter, getOrCreateHookKey, HooksInstaller, HOOK_PATH } from "../monitor/hooks";
import { characterManager, worldManager, characterAssignments } from "../worlds";
import { broadcastWorlds, setWorldsSource } from "../websocket";
import { createPackUploadRouter } from "../packs/upload";
import { configuredPort, isPortAvailable, portBusyMessage } from "./port";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Reject foreign Host headers (DNS rebinding) and cross-site browser requests
  app.use(hostAndOriginGuard);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  // tRPC API
  app.use(
    "/api/trpc",
    localOnly,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // World packs (hot reloaded) + their assets
  setWorldsSource(() => worldManager.state, () => ({ ...characterManager.state, assignments: characterAssignments.all() }));
  worldManager.onChange(() => broadcastWorlds());
  characterManager.onChange(() => broadcastWorlds());
  characterAssignments.onChange = () => broadcastWorlds();
  worldManager.start();
  characterManager.start();
  app.use("/world-assets", worldManager.assetsRouter());
  app.use("/character-assets", characterManager.assetsRouter());
  // Install a pack from a .zip (loopback + same-origin; the managers hot-reload it)
  app.use("/api/packs", createPackUploadRouter());

  // Live session monitor + WebSocket
  initializeWebSocket(server);

  // Claude Code HTTP hooks (optional; installed only when the user clicks Install)
  const hookKey = getOrCreateHookKey();
  app.use(HOOK_PATH, createHooksRouter(() => hookKey, handleHook));
  // Live link for the Ai Gramam mod (messages from the browser, stop, approvals)
  app.use(LINK_PATH, link.router());

  // Bridge API — receives data from the optional remote bridge script
  const { onHeroUpdate, onHeroNew, onHeroesBatch, onHeroClear } = getBroadcastCallbacks();
  app.use("/api/bridge", createBridgeRouter(onHeroUpdate, onHeroNew, onHeroesBatch, onHeroClear));
  // development mode uses Vite, production mode uses static files
  if (!isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = configuredPort(process.env.PORT);
  if (port === null) {
    console.error(`Ai Gramam couldn't start: PORT="${process.env.PORT}" isn't a valid port number.`);
    process.exit(1);
  }
  // A busy port means the mod and hooks can't reach this server: say so and stop rather than move ports.
  if (!(await isPortAvailable(port, BIND_HOST))) {
    console.error(portBusyMessage(port));
    process.exit(1);
  }
  runtime.port = port;

  const installer = new HooksInstaller();
  const refreshHooksStatus = () => setHooksInstalled(installer.status(port).installed);
  refreshHooksStatus();
  setInterval(refreshHooksStatus, 10_000);

  server.listen(port, BIND_HOST, () => {
    console.log(`Server running on http://localhost:${port}/ (bound to ${BIND_HOST})`);
  });
}

startServer().catch(console.error);
