import { NextResponse } from "next/server";
import { pool } from "../../../src/infrastructure/postgres/pool";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT user_id AS id, full_name AS name, email FROM app_user ORDER BY full_name",
    );
    return NextResponse.json({ users: rows });
  } catch (error) {
    console.error("No se pudieron consultar los usuarios locales", error);
    return NextResponse.json({ error: "No se pudo conectar con PostgreSQL." }, { status: 503 });
  }
}
