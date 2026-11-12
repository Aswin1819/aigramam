import fs from "fs";

/** How much of an existing file to read when we first see it. */
export const DEFAULT_TAIL_BYTES = 256 * 1024;
/** Upper bound for a single read, so a huge burst can't allocate unbounded memory. */
const MAX_READ_BYTES = 8 * 1024 * 1024;

/**
 * Reads complete lines appended to a file.
 * - Starts near the end of an existing file (tailBytes) instead of replaying history.
 * - Keeps an incomplete last line as raw bytes until its newline arrives,
 *   so lines and multi-byte UTF-8 characters are never split or lost.
 * - Restarts from the beginning if the file shrinks (rotated/truncated).
 */
export class FileTailer {
  private offset = -1;
  private leftover: Buffer = Buffer.alloc(0);
  private skipFirstLine = false;

  constructor(
    readonly filePath: string,
    private readonly tailBytes = DEFAULT_TAIL_BYTES,
  ) {}

  /** Read everything new since the last call. Returns complete lines; never throws. */
  readNewLines(): string[] {
    let size: number;
    try {
      size = fs.statSync(this.filePath).size;
    } catch {
      return [];
    }

    if (this.offset < 0) {
      this.offset = Math.max(0, size - this.tailBytes);
      this.skipFirstLine = this.offset > 0;
    } else if (size < this.offset) {
      this.offset = 0;
      this.leftover = Buffer.alloc(0);
      this.skipFirstLine = false;
    }
    if (size === this.offset) return [];

    const lines: string[] = [];
    let fd: number | null = null;
    try {
      fd = fs.openSync(this.filePath, "r");
      while (this.offset < size) {
        const len = Math.min(size - this.offset, MAX_READ_BYTES);
        const buf = Buffer.alloc(len);
        const n = fs.readSync(fd, buf, 0, len, this.offset);
        if (n <= 0) break;
        this.offset += n;
        this.consume(buf.subarray(0, n), lines);
      }
    } catch {
      // Unreadable right now (locked/deleted); try again on the next poll.
    } finally {
      if (fd !== null) try { fs.closeSync(fd); } catch {}
    }
    return lines;
  }

  private consume(chunk: Buffer, out: string[]) {
    const data = this.leftover.length ? Buffer.concat([this.leftover, chunk]) : chunk;
    let start = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0x0a) continue;
      const line = data.subarray(start, i).toString("utf8").replace(/\r$/, "");
      start = i + 1;
      if (this.skipFirstLine) {
        this.skipFirstLine = false; // we started mid-line; drop the fragment
        continue;
      }
      if (line.trim()) out.push(line);
    }
    this.leftover = Buffer.from(data.subarray(start));
  }
}

/**
 * Stream a whole file looking only at lines that contain `needle`.
 * Used to find rare records (like a /rename title) far from the end of a big transcript.
 */
export async function scanLinesContaining(filePath: string, needles: string[], onLine: (line: string) => void): Promise<void> {
  const readline = await import("readline");
  await new Promise<void>((resolve) => {
    let stream: fs.ReadStream;
    try {
      stream = fs.createReadStream(filePath, { encoding: "utf8" });
    } catch {
      return resolve();
    }
    stream.on("error", () => resolve());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("error", () => resolve()); // readline re-emits stream errors (e.g. file deleted mid-scan)
    rl.on("line", (line) => {
      for (const n of needles) {
        if (line.includes(n)) {
          onLine(line);
          return;
        }
      }
    });
    rl.on("close", () => resolve());
  });
}
