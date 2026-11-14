/**
 * Which shell a managed terminal starts, and how it's told to run Claude Code.
 *
 * - Windows: PowerShell (`powershell.exe`).
 * - macOS and Linux: the person's own login shell (`$SHELL`, when it's an
 *   absolute path to a file), else zsh on macOS and bash on Linux, else /bin/sh.
 *
 * "Start Claude Code" runs `claude` as the shell's start command and keeps a
 * shell open after it exits. Nothing is ever typed into the terminal.
 */
import fs from "fs";
import path from "path";

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** The shell program for managed terminals on this computer. */
export function chooseShell(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = isFile): string {
  if (platform === "win32") return "powershell.exe";
  const own = env.SHELL;
  if (own && path.posix.isAbsolute(own) && exists(own)) return own;
  const fallbacks = platform === "darwin" ? ["/bin/zsh", "/bin/bash"] : ["/bin/bash", "/usr/bin/bash", "/bin/zsh"];
  return fallbacks.find(exists) ?? "/bin/sh";
}

/** The shell's file name without folder or ".exe", lower case: "powershell", "pwsh", "zsh", "bash", "fish"… */
export function shellKind(shell: string): string {
  return shell.split(/[\\/]/).pop()!.replace(/\.exe$/i, "").toLowerCase();
}

/** A short name for the UI: "PowerShell", "zsh", "bash"… */
export function shellLabel(shell: string): string {
  const kind = shellKind(shell);
  return kind === "powershell" || kind === "pwsh" ? "PowerShell" : kind;
}

/**
 * The shell's arguments: a plain interactive shell, or one that runs `claude`
 * first and stays open afterwards.
 * - PowerShell: `-NoExit -Command claude`.
 * - fish: `-C claude` (runs it, then the interactive prompt).
 * - sh-like shells (zsh, bash, sh…): an interactive login shell runs `claude`,
 *   then replaces itself with a fresh login shell (`exec "$0" -l`, where $0 is the
 *   shell's own path passed as the last argument). Interactive and login, so
 *   PATH from the person's profile and rc files applies, as in their own terminal.
 */
export function shellArgs(shell: string, withClaude: boolean): string[] {
  const kind = shellKind(shell);
  if (kind === "powershell" || kind === "pwsh") return withClaude ? ["-NoLogo", "-NoExit", "-Command", "claude"] : ["-NoLogo"];
  if (kind === "fish") return withClaude ? ["-l", "-C", "claude"] : ["-l"];
  return withClaude ? ["-i", "-l", "-c", 'claude; exec "$0" -l', shell] : ["-l"];
}
