import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import {
  safeChildPath,
  isAllowedHost,
  isAllowedOrigin,
  isLoopbackAddress,
} from "./_core/security";

const base = path.join(os.tmpdir(), "dungeon-skills");

describe("safeChildPath", () => {
  it("accepts normal names", () => {
    expect(safeChildPath(base, "my-skill")).toBe(path.join(base, "my-skill"));
    expect(safeChildPath(base, "My.Skill_2")).toBe(path.join(base, "My.Skill_2"));
    expect(safeChildPath(base, "reviewer", ".md")).toBe(path.join(base, "reviewer.md"));
  });

  it.each([
    "..",
    ".",
    "",
    "../..",
    "../../Desktop",
    "a/b",
    "a\\b",
    "..\\..\\Windows",
    "C:\\Windows",
    "/etc",
    "x:stream",
    "bad\0name",
    "a".repeat(200),
  ])("rejects %j", (name) => {
    expect(() => safeChildPath(base, name)).toThrow(/Invalid name/);
  });

  it("rejects traversal through the suffix too", () => {
    expect(() => safeChildPath(base, "..", ".md")).toThrow();
  });
});

describe("host / origin checks", () => {
  it("allows loopback hosts", () => {
    for (const h of ["localhost:4317", "127.0.0.1:4317", "[::1]:4317", "localhost"]) {
      expect(isAllowedHost(h)).toBe(true);
    }
  });

  it("rejects other hosts (DNS rebinding)", () => {
    for (const h of ["evil.com", "evil.com:4317", "192.168.1.5:4317", "localhost.evil.com", undefined]) {
      expect(isAllowedHost(h)).toBe(false);
    }
  });

  it("allows same-machine origins and missing origin, rejects foreign ones", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:4317")).toBe(true);
    expect(isAllowedOrigin("https://evil.com")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false);
  });

  it("recognises loopback socket addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.5")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});
