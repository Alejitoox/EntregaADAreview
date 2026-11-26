/**
 * Integridad de un horario que el navegador quiere guardar.
 *
 * El navegador manda el archivo JSON de origen, el horario y el nivel. Nada de eso
 * se acepta tal cual: se vuelve a validar el archivo, se comprueba que cada grupo
 * del horario exista en ese catálogo y pertenezca a su materia, que la materia haya
 * sido pedida por el estudiante, y que el conjunto cumpla de verdad el nivel que se
 * declara (sin cruces, con cupos, créditos, etc.). Lo que se guarda es una versión
 * reconstruida desde el catálogo, nunca los datos que mandó el navegador.
 */
import { construirHorario } from "../../domain/scheduling/generador.ts";
import type { Grupo } from "../../domain/scheduling/modelo.ts";
import { cumpleNivel, NIVEL_MAXIMO } from "../../domain/scheduling/niveles.ts";
import { preprocesar } from "../../domain/scheduling/preprocesamiento.ts";
import { validarEntrada } from "../../domain/scheduling/validacion.ts";
import { compactar, vistaDeCompacto, type HorarioVista } from "./ejecutar-archivo.ts";

export type HorarioGuardadoVerificado =
  | { ok: true; horario: HorarioVista }
  | { ok: false; error: string };

const esTexto = (valor: unknown): valor is string => typeof valor === "string" && valor.length > 0;

export function verificarHorarioGuardado(entrada: {
  sourceJson: unknown;
  schedule: unknown;
  level: unknown;
  title: string;
}): HorarioGuardadoVerificado {
  const { sourceJson, schedule, level, title } = entrada;

  if (!Number.isInteger(level) || (level as number) < 0 || (level as number) > NIVEL_MAXIMO) {
    return { ok: false, error: `El nivel debe ser un número entero de 0 a ${NIVEL_MAXIMO}.` };
  }

  const { errores, datos } = validarEntrada(sourceJson);
  if (!datos) {
    return {
      ok: false,
      error: `El archivo de origen no es válido (${errores.length} ${errores.length === 1 ? "error" : "errores"}).`,
    };
  }
  const instancia = preprocesar(datos.catalogo, datos.estudiante);

  const cursos = (schedule as { courses?: unknown } | null)?.courses;
  if (!Array.isArray(cursos) || cursos.length === 0) {
    return { ok: false, error: "El horario no tiene materias." };
  }

  const seleccion: Grupo[] = [];
  const materiasUsadas = new Set<string>();
  for (const curso of cursos) {
    const courseId = (curso as { courseId?: unknown } | null)?.courseId;
    const sectionId = (curso as { sectionId?: unknown } | null)?.sectionId;
    if (!esTexto(courseId) || !esTexto(sectionId)) {
      return { ok: false, error: "Cada materia del horario necesita su id y el id del grupo." };
    }
    const grupo = instancia.grupos.get(sectionId);
    if (!grupo || grupo.materiaId !== courseId) {
      return { ok: false, error: `El grupo ${sectionId} no existe para la materia ${courseId}.` };
    }
    if (!instancia.solicitadasPorId.has(courseId)) {
      return { ok: false, error: `La materia ${courseId} no está en la lista del estudiante.` };
    }
    if (materiasUsadas.has(courseId)) {
      return { ok: false, error: `La materia ${courseId} aparece más de una vez.` };
    }
    materiasUsadas.add(courseId);
    seleccion.push(grupo);
  }

  if (!cumpleNivel(level as number, seleccion, instancia)) {
    return { ok: false, error: `El horario no cumple el nivel ${level} que se declaró.` };
  }

  // Número del horario: el del nombre ("Horario 3") si lo trae; solo es una etiqueta.
  const numero = Number(/(\d+)\s*$/.exec(String((schedule as { name?: unknown }).name ?? ""))?.[1]);
  const horario = vistaDeCompacto(
    compactar(
      construirHorario(Number.isInteger(numero) && numero > 0 ? numero : 1, seleccion, instancia),
    ),
    instancia,
  );
  return { ok: true, horario: { ...horario, name: title } };
}
