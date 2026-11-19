import { afterEach, describe, expect, it } from "vitest";
import net from "net";
import { DEFAULT_PORT, configuredPort, isPortAvailable, portBusyMessage, portErrorMessage, probePort } from "./_core/port";

let blocker: net.Server | null = null;
afterEach(() => new Promise<void>((r) => (blocker ? blocker.close(() => r()) : r())).then(() => (blocker = null)));

describe("server port", () => {
  it("defaults to Ai Gramam's port and rejects nonsense", () => {
    expect(configuredPort(undefined)).toBe(DEFAULT_PORT);
    expect(configuredPort("")).toBe(4317);
    expect(configuredPort("5000")).toBe(5000);
    expect(configuredPort("abc")).toBeNull();
    expect(configuredPort("70000")).toBeNull();
  });

  it("notices when the port is taken, and explains instead of moving", async () => {
    blocker = net.createServer();
    await new Promise<void>((r) => blocker!.listen(0, "127.0.0.1", () => r()));
    const port = (blocker.address() as net.AddressInfo).port;
    expect(await isPortAvailable(port, "127.0.0.1")).toBe(false);
    const msg = portBusyMessage(port);
    expect(msg).toContain(`port ${port} is already in use`);
    expect(msg).toContain("AI_GRAMAM_URL");
    await new Promise<void>((r) => blocker!.close(() => r()));
    blocker = null;
    expect(await isPortAvailable(port, "127.0.0.1")).toBe(true);
  });
  it("says why a port can't be used, not only that it is busy", async () => {
    expect(portErrorMessage(4317, "EADDRINUSE")).toBe(portBusyMessage(4317));
    const reserved = portErrorMessage(4317, "EACCES");
    expect(reserved).toContain("isn't allowed to use port 4317");
    expect(reserved).toContain("excludedportrange");
    expect(reserved).not.toContain("already in use");
    expect(portErrorMessage(4317, "EINVAL")).toContain("(EINVAL)");
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", () => r()));
    const port = (blocker.address() as net.AddressInfo).port;
    expect(await probePort(port, "127.0.0.1")).toBe("EADDRINUSE");
    await new Promise((r) => blocker.close(r));
    expect(await probePort(port, "127.0.0.1")).toBeNull();
  });
});
