import net from "net";

/** Ai Gramam's port. The mod and the hooks are set up for it, so the server never moves to another one by itself. */
export const DEFAULT_PORT = 4317;

/** True when nothing else is listening on `port` at `host`. */
export function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

/** The port from the environment (PORT), or the default; null when PORT isn't a valid port number. */
export function configuredPort(env: string | undefined): number | null {
  if (env === undefined || env.trim() === "") return DEFAULT_PORT;
  const n = Number(env);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/** What to tell the person when the port is taken, instead of quietly using another one. */
export function portBusyMessage(port: number): string {
  return [
    `Ai Gramam couldn't start: port ${port} is already in use.`,
    `- Is Ai Gramam already running? Open http://localhost:${port}/`,
    `- The Ai Gramam mod and hooks send sessions to this port, so the server won't switch to another port on its own.`,
    `- To use a different port, set PORT in .env and start Claude Code with AI_GRAMAM_URL=http://127.0.0.1:<port> for the mod.`,
  ].join("\n");
}
