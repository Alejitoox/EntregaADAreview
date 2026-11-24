import { NextResponse } from "next/server";
import { pool } from "../../../src/infrastructure/postgres/pool";
import type { GeneratedSchedule } from "../../../src/application/scheduling/prepare-level-zero";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Selecciona un usuario." }, { status: 400 });

  try {
    const { rows } = await pool.query(
      `SELECT s.schedule_id AS id, s.title, s.algorithm_level AS level,
              s.generated_schedule AS schedule, s.source_json AS source_json,
              s.created_at AS created_at, owner.full_name AS owner_name,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', participant.user_id,
                'name', participant_user.full_name,
                'email', participant_user.email,
                'role', participant.role
              ) ORDER BY participant_user.full_name) FILTER (WHERE participant.user_id IS NOT NULL), '[]'::jsonb) AS participants
       FROM user_schedule s
       JOIN schedule_participant visible ON visible.schedule_id = s.schedule_id AND visible.user_id = $1
       JOIN app_user owner ON owner.user_id = s.created_by_user_id
       LEFT JOIN schedule_participant participant ON participant.schedule_id = s.schedule_id
       LEFT JOIN app_user participant_user ON participant_user.user_id = participant.user_id
       GROUP BY s.schedule_id, owner.full_name
       ORDER BY s.created_at DESC`,
      [userId],
    );
    return NextResponse.json({ schedules: rows });
  } catch (error) {
    console.error("No se pudieron consultar los horarios guardados", error);
    return NextResponse.json({ error: "No se pudo consultar PostgreSQL." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    ownerUserId?: unknown;
    participantIds?: unknown;
    title?: unknown;
    sourceJson?: unknown;
    schedule?: unknown;
    level?: unknown;
  } | null;

  if (
    !body || typeof body.ownerUserId !== "string" || !Array.isArray(body.participantIds) ||
    typeof body.title !== "string" || !body.title.trim() ||
    body.sourceJson === undefined || body.schedule === undefined ||
    !Number.isInteger(body.level) || Number(body.level) < 0
  ) {
    return NextResponse.json({ error: "Faltan datos válidos para guardar el horario." }, { status: 400 });
  }

  const ownerUserId = body.ownerUserId;
  const participantIds = [...new Set(body.participantIds.filter((id): id is string => typeof id === "string"))];
  if (participantIds.length !== body.participantIds.length || participantIds.includes(ownerUserId)) {
    return NextResponse.json({ error: "Revisa la lista de participantes seleccionados." }, { status: 400 });
  }
  const savedSchedule = body.schedule as GeneratedSchedule;
  if (!savedSchedule || !Array.isArray(savedSchedule.courses)) {
    return NextResponse.json({ error: "La estructura del horario no es válida." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query<{ user_id: string }>(
      "SELECT user_id FROM app_user WHERE user_id = ANY($1::text[])",
      [[ownerUserId, ...participantIds]],
    );
    if (users.rowCount !== participantIds.length + 1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Un usuario seleccionado no existe." }, { status: 400 });
    }

    const inserted = await client.query<{ schedule_id: number }>(
      `INSERT INTO user_schedule
         (created_by_user_id, title, algorithm_level, generated_schedule, source_json)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING schedule_id`,
      [ownerUserId, body.title.trim(), body.level, JSON.stringify(savedSchedule), JSON.stringify(body.sourceJson)],
    );
    const scheduleId = inserted.rows[0].schedule_id;
    await client.query(
      "INSERT INTO schedule_participant (schedule_id, user_id, role) VALUES ($1, $2, 'owner')",
      [scheduleId, ownerUserId],
    );
    if (participantIds.length) {
      await client.query(
        `INSERT INTO schedule_participant (schedule_id, user_id, role)
         SELECT $1, user_id, 'participant' FROM unnest($2::text[]) AS user_id`,
        [scheduleId, participantIds],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ id: scheduleId }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("No se pudo guardar el horario", error);
    return NextResponse.json({ error: "No se pudo guardar el horario en PostgreSQL." }, { status: 503 });
  } finally {
    client.release();
  }
}
