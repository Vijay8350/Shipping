import { PrismaClient } from "@prisma/client";

// Single shared Prisma client (CLAUDE.md §4: web and worker share the same client
// config). In dev, avoid exhausting connections across HMR reloads.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export default prisma;
