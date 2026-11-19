import net from "net";

/** Ai Gramam's port. The mod and the hooks are set up for it, so the server never moves to another one by itself. */
export const DEFAULT_PORT = 4317;

/** Tries to listen on `port` at `host`: null when it can be used, else the error code (EADDRINUSE, EACCES…). */
export function probePort(port: number, host: string): Promise<string | null> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "UNKNOWN"));
    probe.listen(port, host, () => probe.close(() => resolve(null)));
  });
}

/** True when nothing else is listening on `port` at `host`. */
export async function isPortAvailable(port: number, host: string): Promise<boolean> {
  return (await probePort(port, host)) === null;
}

/** The port from the environment (PORT), or the default; null when PORT isn't a valid port number. */
export function configuredPort(env: string | undefined): number | null {
  if (env === undefined || env.trim() === "") return DEFAULT_PORT;
  const n = Number(env);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/** What to tell the person when the port can't be used, worded for why (the error code from probePort or listen). */
export function portErrorMessage(port: number, code: string): string {
  if (code === "EADDRINUSE") return portBusyMessage(port);
  const fix = `- To use a different port, set PORT in .env and start Claude Code with AI_GRAMAM_URL=http://127.0.0.1:<port> for the mod.`;
  if (code === "EACCES")
    return [
      `Ai Gramam couldn't start: it isn't allowed to use port ${port}.`,
      `- On Windows, Hyper-V, WSL or Docker may reserve a range of ports. See them with: netsh int ipv4 show excludedportrange protocol=tcp`,
      `- Ports below 1024 need administrator rights on macOS and Linux.`,
      fix,
    ].join("\n");
  return [`Ai Gramam couldn't start: port ${port} can't be used (${code}).`, fix].join("\n");
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
