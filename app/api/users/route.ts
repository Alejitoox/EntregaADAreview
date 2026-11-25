import { NextResponse } from "next/server";
import { pool } from "../../../src/infrastructure/postgres/pool";
import { authEnabled } from "../../../src/infrastructure/supabase/config";
import { usuarioAutenticado } from "../../../src/infrastructure/supabase/usuario-autenticado";

export const runtime = "nodejs";

/**
 * Perfiles disponibles para compartir un horario. Con login real, solo responde
 * a usuarios autenticados; en modo local lista los usuarios de demostración.
 */
export async function GET(request: Request) {
  if (authEnabled && !(await usuarioAutenticado(request))) {
    return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  }
  try {
    const { rows } = await pool.query(
      "SELECT user_id AS id, full_name AS name, email FROM app_user ORDER BY full_name",
    );
    return NextResponse.json({ users: rows });
  } catch (error) {
    console.error("No se pudieron consultar los usuarios", error);
    return NextResponse.json({ error: "No se pudo conectar con PostgreSQL." }, { status: 503 });
  }
}
