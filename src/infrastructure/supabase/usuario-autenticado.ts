import { createClient } from "@supabase/supabase-js";
import { pool } from "../postgres/pool";
import { supabaseKey, supabaseUrl } from "./config";

export type UsuarioAutenticado = { id: string; name: string; email: string };

/**
 * Quién hace la petición: valida el token de Supabase Auth que viene en la
 * cabecera `Authorization: Bearer <token>` preguntándole a Supabase. Devuelve
 * null si falta el token o no es válido. Nunca se confía en un id que mande el
 * navegador.
 */
export async function usuarioAutenticado(request: Request): Promise<UsuarioAutenticado | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  const user = data.user;
  if (error || !user?.email) return null;

  const fullName = user.user_metadata?.full_name;
  return {
    id: user.id,
    email: user.email,
    name:
      typeof fullName === "string" && fullName.trim() ? fullName.trim() : user.email.split("@")[0],
  };
}

/** Crea o actualiza la fila de `app_user` del usuario autenticado. */
export async function asegurarUsuario(usuario: UsuarioAutenticado): Promise<void> {
  await pool.query(
    `INSERT INTO app_user (user_id, full_name, email) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email`,
    [usuario.id, usuario.name, usuario.email],
  );
}
