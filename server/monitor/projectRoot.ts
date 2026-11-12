import fs from "fs";
import path from "path";

export interface ProjectInfo {
  id: string;
  name: string;
  root: string;
}

const cache = new Map<string, ProjectInfo>();

/** Stable id for a folder: case-insensitive on Windows, trailing separators removed. */
export function projectIdFor(dir: string): string {
  const norm = path.resolve(dir).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? norm.toLowerCase() : norm;
}

/**
 * A session's project is the git repository that contains its working
 * directory, or the working directory itself when it isn't in a repo.
 * Read-only: only checks whether a `.git` entry exists.
 */
export function resolveProject(cwd: string, exists: (p: string) => boolean = fs.existsSync): ProjectInfo {
  const key = projectIdFor(cwd);
  const hit = cache.get(key);
  if (hit) return hit;

  let root = path.resolve(cwd);
  let dir = root;
  for (let i = 0; i < 64; i++) {
    if (exists(path.join(dir, ".git"))) {
      root = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const info: ProjectInfo = { id: projectIdFor(root), name: path.basename(root) || root, root };
  cache.set(key, info);
  return info;
}

export function clearProjectCache() {
  cache.clear();
}
