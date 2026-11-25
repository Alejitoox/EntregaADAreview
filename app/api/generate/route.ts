import { NextResponse } from "next/server";
import {
  generarDesdeArchivo,
  validarArchivo,
} from "../../../src/application/scheduling/ejecutar-archivo";
import { authEnabled } from "../../../src/infrastructure/supabase/config";
import { usuarioAutenticado } from "../../../src/infrastructure/supabase/usuario-autenticado";

export const runtime = "nodejs";

/**
 * POST { sourceJson, validateOnly? }
 *  - validateOnly: responde { valid, errores } con TODOS los errores del archivo.
 *  - si no: valida y ejecuta los 9 niveles; responde la RespuestaGeneracion completa.
 * Un archivo inválido no es un error HTTP: es un resultado con estado ARCHIVO_INVALIDO.
 */
export async function POST(request: Request) {
  if (authEnabled && !(await usuarioAutenticado(request))) {
    return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    sourceJson?: unknown;
    validateOnly?: boolean;
  } | null;
  if (!body || body.sourceJson === undefined) {
    return NextResponse.json({ error: "Envía el contenido del archivo JSON." }, { status: 400 });
  }
  try {
    if (body.validateOnly === true) {
      const { errores } = validarArchivo(body.sourceJson);
      return NextResponse.json({ valid: errores.length === 0, errores });
    }
    return NextResponse.json(generarDesdeArchivo(body.sourceJson));
  } catch (error) {
    console.error("Fallo inesperado al generar horarios", error);
    return NextResponse.json({ error: "No se pudo generar el horario." }, { status: 500 });
  }
}
