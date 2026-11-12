import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { BIND_HOST, hostAndOriginGuard, localOnly } from "./security";
import { isProduction, runtime } from "./runtime";
import { initializeWebSocket, getBroadcastCallbacks, handleHook, setHooksInstalled } from "../websocket";
import { createBridgeRouter } from "../bridge";
import { createHooksRouter, getOrCreateHookKey, HooksInstaller, HOOK_PATH } from "../monitor/hooks";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, BIND_HOST, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

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
  // Live session monitor + WebSocket
  initializeWebSocket(server);

  // Claude Code HTTP hooks (optional; installed only when the user clicks Install)
  const hookKey = getOrCreateHookKey();
  app.use(HOOK_PATH, createHooksRouter(() => hookKey, handleHook));

  // Bridge API — receives data from the optional remote bridge script
  const { onHeroUpdate, onHeroNew, onHeroesBatch, onHeroClear } = getBroadcastCallbacks();
  app.use("/api/bridge", createBridgeRouter(onHeroUpdate, onHeroNew, onHeroesBatch, onHeroClear));
  // development mode uses Vite, production mode uses static files
  if (!isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
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
