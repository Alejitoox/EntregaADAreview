import { Pool } from "pg";

declare global {
  // Keeps Next.js hot reload from opening a new pool on every edit.
  var complexSchedulePool: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://complex_schedule:local_dev_password@localhost:5432/complex_schedule";

export const pool =
  globalThis.complexSchedulePool ??
  new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });

if (process.env.NODE_ENV !== "production") globalThis.complexSchedulePool = pool;
