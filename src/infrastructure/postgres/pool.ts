import { Pool } from "pg";

declare global {
  // Keeps Next.js hot reload from opening a new pool on every edit.
  var complexSchedulePool: Pool | undefined;
}

/**
 * Conexión a Supabase Postgres. DATABASE_URL es la cadena del "Session pooler" de
 * Supabase (ver docs/supabase.md); si falta, la primera consulta falla y la API
 * responde con un error de base de datos. Supabase exige conexión cifrada.
 */
export const pool =
  globalThis.complexSchedulePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") globalThis.complexSchedulePool = pool;
