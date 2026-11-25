import { Pool } from "pg";

declare global {
  // Keeps Next.js hot reload from opening a new pool on every edit.
  var complexSchedulePool: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://complex_schedule:local_dev_password@localhost:5432/complex_schedule";

// Supabase exige conexión cifrada; el PostgreSQL local de Docker no la usa.
const usaSupabase = /supabase\.(com|co)/.test(connectionString);

export const pool =
  globalThis.complexSchedulePool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: usaSupabase ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalThis.complexSchedulePool = pool;
