import { NextResponse } from "next/server";
import { prepareLevelZero } from "../../../src/application/scheduling/prepare-level-zero";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sourceJson?: unknown };
    if (body.sourceJson === undefined) {
      return NextResponse.json({ error: "Envía el contenido del archivo JSON." }, { status: 400 });
    }
    return NextResponse.json({ level: 0, ...prepareLevelZero(body.sourceJson) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el horario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
