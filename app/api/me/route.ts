import { NextResponse } from "next/server";
import { authEnabled } from "../../../src/infrastructure/supabase/config";
import {
  asegurarUsuario,
  usuarioAutenticado,
} from "../../../src/infrastructure/supabase/usuario-autenticado";

export const runtime = "nodejs";

/** El usuario de la sesión actual; lo registra en `app_user` si es la primera vez. */
export async function GET(request: Request) {
  if (!authEnabled) {
    return NextResponse.json({ error: "El inicio de sesión no está configurado." }, { status: 404 });
  }
  const usuario = await usuarioAutenticado(request);
  if (!usuario) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    await asegurarUsuario(usuario);
    return NextResponse.json({ user: usuario });
  } catch (error) {
    console.error("No se pudo registrar al usuario", error);
    return NextResponse.json({ error: "No se pudo conectar con la base de datos." }, { status: 503 });
  }
}
