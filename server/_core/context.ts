import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

/** No login: the API only serves this machine (see security.ts). */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  return { req: opts.req, res: opts.res };
}
