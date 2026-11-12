/**
 * Local-only security guards.
 *
 * Claude Dungeon reads and writes files under ~/.claude, so its API must only be
 * reachable by the person sitting at this machine:
 *   - the server binds to 127.0.0.1 by default (HOST env to override)
 *   - the Host header must be a loopback name (blocks DNS-rebinding attacks)
 *   - browser requests from other origins are rejected (blocks drive-by CSRF from
 *     any website open in the same browser)
 *   - file names coming from the API can never escape their parent directory
 */
import path from "path";
import type { IncomingMessage } from "http";
import type { Request, Response, NextFunction } from "express";

export const BIND_HOST = process.env.HOST || "127.0.0.1";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const extraHosts = (process.env.ALLOWED_HOSTS || "")
  .split(",")
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

function hostnameOf(hostHeader: string | undefined): string {
  if (!hostHeader) return "";
  const h = hostHeader.toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1); // [::1]:4317
  return h.split(":")[0];
}

export function isAllowedHost(hostHeader: string | undefined): boolean {
  const name = hostnameOf(hostHeader);
  return LOOPBACK_HOSTNAMES.has(name) || extraHosts.includes(name);
}

/** Origin header absent (non-browser client) or pointing at an allowed host. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return isAllowedHost(u.host);
  } catch {
    return false;
  }
}

export function isLoopbackAddress(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function isLocalRequest(req: IncomingMessage): boolean {
  return isLoopbackAddress(req.socket.remoteAddress);
}

/** Reject requests with a foreign Host header or a cross-site Origin. */
export function hostAndOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (!isAllowedHost(req.headers.host)) {
    res.status(403).json({ error: "Host not allowed" });
    return;
  }
  if (!isAllowedOrigin(req.headers.origin)) {
    res.status(403).json({ error: "Cross-origin request blocked" });
    return;
  }
  next();
}

/** The tRPC API touches ~/.claude on this machine: only serve it to this machine. */
export function localOnly(req: Request, res: Response, next: NextFunction) {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "This API is only available from localhost" });
    return;
  }
  next();
}

/** Same checks for the WebSocket upgrade request. */
export function verifyWsClient(info: { origin: string; req: IncomingMessage }): boolean {
  return isAllowedHost(info.req.headers.host) && isAllowedOrigin(info.origin || undefined);
}

/**
 * Resolve `name` (+ optional suffix) as a direct child of `parentDir`.
 * Throws if the name contains path separators or `..`, or would land anywhere
 * other than directly inside parentDir.
 */
export function safeChildPath(parentDir: string, name: string, suffix = ""): string {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > 128 ||
    name === "." ||
    name === ".." ||
    /[\\/\0:]/.test(name)
  ) {
    throw new Error(`Invalid name: ${JSON.stringify(name)}`);
  }
  const parent = path.resolve(parentDir);
  const target = path.resolve(parent, name + suffix);
  if (path.dirname(target) !== parent) {
    throw new Error(`Invalid name: ${JSON.stringify(name)}`);
  }
  return target;
}
