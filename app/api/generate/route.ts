import { NextResponse } from "next/server";
import {
  generarDesdeArchivo,
  validarArchivo,
} from "../../../src/application/scheduling/ejecutar-archivo";
import { authEnabled } from "../../../src/infrastructure/supabase/config";
import { usuarioAutenticado } from "../../../src/infrastructure/supabase/usuario-autenticado";

export const runtime = "nodejs";

/**
 * POST { sourceJson, validateOnly?, limite? }
 *  - validateOnly: responde { valid, errores } con TODOS los errores del archivo
 *    (solo valida: no ejecuta el algoritmo).
 *  - si no: valida y ejecuta los 9 niveles; responde la RespuestaGeneracion completa.
 *  - limite (opcional): tope de horarios a devolver. Sin él se devuelven todos.
 * Un archivo inválido no es un error HTTP: es un resultado con estado ARCHIVO_INVALIDO.
 */
export async function POST(request: Request) {
  if (authEnabled && !(await usuarioAutenticado(request))) {
    return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    sourceJson?: unknown;
    validateOnly?: boolean;
    limite?: unknown;
  } | null;
  if (!body || body.sourceJson === undefined) {
    return NextResponse.json({ error: "Envía el contenido del archivo JSON." }, { status: 400 });
  }
  try {
    if (body.validateOnly === true) {
      const { errores } = validarArchivo(body.sourceJson);
      return NextResponse.json({ valid: errores.length === 0, errores });
    }
    const limite =
      body.limite === undefined
        ? undefined
        : Number.isInteger(body.limite) && Number(body.limite) >= 1
          ? Number(body.limite)
          : null;
    if (limite === null) {
      return NextResponse.json({ error: "El límite debe ser un entero positivo." }, { status: 400 });
    }
    return NextResponse.json(generarDesdeArchivo(body.sourceJson, limite));
  } catch (error) {
    console.error("Fallo inesperado al generar horarios", error);
    return NextResponse.json({ error: "No se pudo generar el horario." }, { status: 500 });
  }
}
