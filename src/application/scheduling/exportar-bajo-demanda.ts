/**
 * Descargas bajo demanda.
 *
 * El servidor ya no manda el JSON y el TXT de cada horario: con miles de horarios
 * eso pesaría muchísimo y casi nadie los descarga todos. Estos textos se arman
 * aquí, en el momento de pulsar "Descargar", a partir de lo que la pantalla ya
 * tiene (el horario o el resultado) y del archivo JSON de origen (que contiene el
 * catálogo). Se usan los mismos exportadores del dominio que en las pruebas, así
 * que el formato es exactamente el de la sección 2.3 del informe.
 *
 * Es código puro (sin Node ni React): corre en el navegador.
 */
import {
  exportarHorarioJSON,
  exportarHorarioTXT,
  exportarJSON,
  exportarTXT,
  indexarCatalogo,
  type IndiceCatalogo,
  type Validez,
} from "../../domain/scheduling/exportar.ts";
import {
  criteriosActivos,
  type Criterio,
  type Estudiante,
  type Horario,
  type Resultado,
} from "../../domain/scheduling/modelo.ts";
import {
  criteriosIncumplidosDe,
  NIVEL_MAXIMO,
} from "../../domain/scheduling/niveles.ts";
import { preprocesar, type Instancia } from "../../domain/scheduling/preprocesamiento.ts";
import { validarEntrada } from "../../domain/scheduling/validacion.ts";
import type { RespuestaGeneracion } from "./ejecutar-archivo.ts";

export type ExtensionDescarga = "json" | "txt";

/**
 * Lo mínimo que se necesita de un horario para exportarlo: el compacto que manda el
 * servidor, el detalle que dibuja la pantalla o un horario guardado (que trae `courses`).
 */
export type HorarioExportable = {
  id?: number;
  grupos?: string[];
  courses?: { courseId: string; sectionId: string }[];
  materias?: { courseId: string; sectionId: string }[];
  creditosTotales?: number;
  omitidas?: Horario["omitidas"];
};

type DatosDeFuente = { indice: IndiceCatalogo; estudiante: Estudiante; instancia: Instancia };

const cache = new WeakMap<object, DatosDeFuente | null>();

/** Catálogo indexado y perfil del archivo de origen; null si el archivo no es válido. */
export function datosDeFuente(fuente: unknown): DatosDeFuente | null {
  if (typeof fuente !== "object" || fuente === null) return null;
  if (cache.has(fuente)) return cache.get(fuente) ?? null;
  const { datos } = validarEntrada(fuente);
  const resultado = datos
    ? {
        indice: indexarCatalogo(datos.catalogo),
        estudiante: datos.estudiante,
        instancia: preprocesar(datos.catalogo, datos.estudiante),
      }
    : null;
  cache.set(fuente, resultado);
  return resultado;
}

export function horarioDesdeVista(vista: HorarioExportable, datos: DatosDeFuente | null): Horario {
  const asignaciones = vista.grupos
    ? vista.grupos.map((grupoId) => ({
        materiaId: datos?.indice.grupos.get(grupoId)?.materiaId ?? "",
        grupoId,
      }))
    : (vista.materias ?? vista.courses ?? []).map((p) => ({
        materiaId: p.courseId,
        grupoId: p.sectionId,
      }));
  const creditos =
    vista.creditosTotales ??
    asignaciones.reduce((suma, a) => suma + (datos?.indice.materias.get(a.materiaId)?.creditos ?? 0), 0);
  return {
    id: vista.id ?? 0,
    asignaciones,
    omitidas: vista.omitidas ?? [],
    creditosTotales: creditos,
  };
}

/** Reconstruye el Resultado del dominio a partir de la respuesta que recibió la pantalla. */
export function resultadoDesdeRespuesta(r: RespuestaGeneracion, datos: DatosDeFuente | null): Resultado {
  return {
    estudianteId: r.estudianteId,
    estado: r.estado,
    criteriosActivos: r.criteriosActivos as Criterio[],
    motivo: r.motivo,
    horarios: r.horarios.map((h) => horarioDesdeVista(h, datos)),
    errores: r.errores,
    nivelAlcanzado: r.nivelAlcanzado,
    criteriosNoCumplidos: r.criteriosNoCumplidos,
    horariosNivelAlcanzado: r.horariosNivelAlcanzado.map((h) => horarioDesdeVista(h, datos)),
    truncado: r.truncado,
  };
}

/** Validez de un horario ya convertido, sabiendo hasta qué nivel cumple. */
function validezDe(horario: Horario, nivel: number, datos: DatosDeFuente): Validez {
  const seleccion = horario.asignaciones
    .map((a) => datos.instancia.grupos.get(a.grupoId))
    .filter((g) => g !== undefined);
  return { cumpleHastaNivel: nivel, incumplimientos: criteriosIncumplidosDe(seleccion, datos.instancia) };
}

/**
 * Por qué un horario NO es válido: nivel hasta el que cumple y criterios que no
 * cumple, con sus materias y sesiones. Devuelve null si el horario es válido (nivel 8)
 * o si el archivo de origen no se puede leer.
 */
export function validezDeHorario(
  vista: HorarioExportable,
  fuente: unknown,
  nivel: number,
): Validez | null {
  if (nivel >= NIVEL_MAXIMO) return null;
  const datos = datosDeFuente(fuente);
  if (!datos) return null;
  return validezDe(horarioDesdeVista(vista, datos), nivel, datos);
}

/**
 * Texto de UN horario. Devuelve null si el archivo de origen no se puede leer (el
 * llamador usa entonces su plan B).
 */
export function textoDeHorario(
  extension: ExtensionDescarga,
  vista: HorarioExportable,
  fuente: unknown,
  nivel: number = NIVEL_MAXIMO,
): string | null {
  const datos = datosDeFuente(fuente);
  if (!datos) return null;
  const resultado: Pick<Resultado, "estudianteId" | "criteriosActivos"> = {
    estudianteId: datos.estudiante.id,
    criteriosActivos: criteriosActivos(datos.estudiante),
  };
  const horario = horarioDesdeVista(vista, datos);
  const validez = nivel >= NIVEL_MAXIMO ? null : validezDe(horario, nivel, datos);
  return extension === "json"
    ? exportarHorarioJSON(resultado as Resultado, horario, validez)
    : exportarHorarioTXT(resultado as Resultado, horario, datos.indice, validez);
}

/** Texto de TODO el resultado (lista completa). */
export function textoDeResultado(
  extension: ExtensionDescarga,
  respuesta: RespuestaGeneracion,
  fuente: unknown,
): string {
  const datos = datosDeFuente(fuente);
  const resultado = resultadoDesdeRespuesta(respuesta, datos);
  // Los horarios de `horariosNivelAlcanzado` no son válidos: cada uno lleva su marca.
  const calculo = datos
    ? (horario: Horario) => validezDe(horario, respuesta.nivelAlcanzado ?? 0, datos)
    : undefined;
  return extension === "json"
    ? exportarJSON(resultado, calculo)
    : exportarTXT(resultado, datos?.indice ?? null, calculo);
}
