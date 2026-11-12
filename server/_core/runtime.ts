/** Values known only once the server is running (e.g. the port it actually bound). */
export const runtime = { port: Number(process.env.PORT) || 3000 };

/** Production = built bundle started with `pnpm start` (works the same on Windows and Unix). */
export const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");
