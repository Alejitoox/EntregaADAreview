import { NextResponse } from "next/server";
import { pool } from "../../../src/infrastructure/postgres/pool";
import { verificarHorarioGuardado } from "../../../src/application/scheduling/validar-horario-guardado";
import { authEnabled } from "../../../src/infrastructure/supabase/config";
import { usuarioAutenticado } from "../../../src/infrastructure/supabase/usuario-autenticado";

export const runtime = "nodejs";

function sinConfigurar() {
  return NextResponse.json({ error: "El inicio de sesión no está configurado." }, { status: 503 });
}

/** Los horarios que guardó el usuario de la sesión (el id sale del token, nunca del navegador). */
export async function GET(request: Request) {
  if (!authEnabled) return sinConfigurar();
  const usuario = await usuarioAutenticado(request);
  if (!usuario) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  try {
    // Alcance de un solo estudiante: solo los horarios de los que es dueño.
    const { rows } = await pool.query(
      `SELECT s.schedule_id AS id, s.title, s.algorithm_level AS level,
              CASE WHEN s.generated_schedule ? 'courses' THEN s.generated_schedule
                ELSE jsonb_build_object('name', s.title, 'courses', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'courseId', a.course_id,
                    'sectionId', a.section_id,
                    'meetings', COALESCE((
                      SELECT jsonb_agg(jsonb_build_object(
                        'day', m.day_of_week::text,
                        'startMinute', m.start_minute,
                        'endMinute', m.end_minute
                      ) ORDER BY m.day_of_week, m.start_minute)
                      FROM section_meeting m
                      WHERE (m.dataset_id, m.course_id, m.section_id) =
                            (a.dataset_id, a.course_id, a.section_id)
                    ), '[]'::jsonb)
                  ) ORDER BY a.course_id)
                  FROM schedule_section_assignment a
                  WHERE a.schedule_id = s.schedule_id AND a.user_id = $1
                ), '[]'::jsonb))
              END AS schedule, s.source_json AS source_json,
              s.created_at AS created_at
       FROM user_schedule s
       JOIN schedule_participant owner
         ON owner.schedule_id = s.schedule_id AND owner.user_id = $1 AND owner.role = 'owner'
       ORDER BY s.created_at DESC`,
      [usuario.id],
    );
    return NextResponse.json({ schedules: rows });
  } catch (error) {
    console.error("No se pudieron consultar los horarios guardados", error);
    return NextResponse.json({ error: "No se pudo consultar la base de datos." }, { status: 503 });
  }
}

/**
 * DELETE /api/schedules?id=N: borra un horario guardado del usuario de la sesión. Solo
 * borra si el usuario es su dueño; la fila de schedule_participant se borra en cascada.
 */
export async function DELETE(request: Request) {
  if (!authEnabled) return sinConfigurar();
  const usuario = await usuarioAutenticado(request);
  if (!usuario) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Indica qué horario quieres eliminar." }, { status: 400 });
  }
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM user_schedule WHERE schedule_id = $1 AND created_by_user_id = $2",
      [id, usuario.id],
    );
    if (!rowCount) {
      return NextResponse.json({ error: "Ese horario no existe o no es tuyo." }, { status: 404 });
    }
    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("No se pudo eliminar el horario", error);
    return NextResponse.json({ error: "No se pudo eliminar el horario." }, { status: 503 });
  }
}

/**
 * POST { title, level, sourceJson, schedule }: guarda un horario del usuario de la sesión.
 * `level` es el nivel hasta el que cumple (8 = válido). Se verifica contra el archivo de
 * origen antes de guardar.
 */
export async function POST(request: Request) {
  if (!authEnabled) return sinConfigurar();
  const usuario = await usuarioAutenticado(request);
  if (!usuario) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    sourceJson?: unknown;
    schedule?: unknown;
    level?: unknown;
  } | null;

  if (
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.sourceJson === undefined ||
    body.schedule === undefined ||
    !Number.isInteger(body.level) ||
    Number(body.level) < 0
  ) {
    return NextResponse.json(
      { error: "Faltan datos válidos para guardar el horario." },
      { status: 400 },
    );
  }

  // Se comprueba que el horario sea real y cumpla el nivel declarado; se guarda la versión
  // reconstruida desde el catálogo del archivo, no lo que mandó el navegador.
  const verificado = verificarHorarioGuardado({
    sourceJson: body.sourceJson,
    schedule: body.schedule,
    level: body.level,
    title: body.title.trim(),
  });
  if (!verificado.ok) {
    return NextResponse.json({ error: verificado.error }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ schedule_id: number }>(
      `INSERT INTO user_schedule
         (created_by_user_id, title, algorithm_level, generated_schedule, source_json)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING schedule_id`,
      [
        usuario.id,
        body.title.trim(),
        body.level,
        JSON.stringify(verificado.horario),
        JSON.stringify(body.sourceJson),
      ],
    );
    const scheduleId = inserted.rows[0].schedule_id;
    // El esquema no cambia: el dueño sigue registrado en schedule_participant.
    await client.query(
      "INSERT INTO schedule_participant (schedule_id, user_id, role) VALUES ($1, $2, 'owner')",
      [scheduleId, usuario.id],
    );
    await client.query("COMMIT");
    return NextResponse.json({ id: scheduleId }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("No se pudo guardar el horario", error);
    return NextResponse.json({ error: "No se pudo guardar el horario." }, { status: 503 });
  } finally {
    client.release();
  }
}
