/**
 * Exportación del resultado (entrega 1, sección 2.3): JSON y TXT.
 *
 * El JSON sigue la Tabla 5. Cuando el estado no es OK se agregan campos extra
 * (`nivelAlcanzado`, `criteriosNoCumplidos`, `horariosNivelAlcanzado`) y cuando
 * el archivo es inválido se agrega la lista `errores`.
 *
 * Un horario que NO es válido (los de `horariosNivelAlcanzado`, o uno guardado con
 * nivel menor que 8) se exporta marcado "NO VÁLIDO", con el nivel hasta el que
 * cumple y los criterios que no cumple. Un horario válido sale igual que en el informe.
 */
import { formatearHora } from "./validacion.ts";
import type { Catalogo, Grupo, Horario, Materia, Profesor, Resultado } from "./modelo.ts";
import { etiquetaDeCriterio, NIVEL_MAXIMO, type Incumplimiento } from "./niveles.ts";

/** Por qué un horario no es válido: hasta qué nivel cumple y qué criterios incumple. */
export type Validez = { cumpleHastaNivel: number; incumplimientos: Incumplimiento[] };

/** Calcula la validez de un horario de `horariosNivelAlcanzado` (lo da quien tiene el catálogo). */
export type CalculoValidez = (horario: Horario) => Validez;

export const MARCA_NO_VALIDO = "NO VÁLIDO";

function criteriosAJson(validez: Validez) {
  return validez.incumplimientos.map((i) => ({
    criterio: i.criterio,
    detalle: i.detalle,
    responsables: i.responsables.map((r) => ({
      materiaId: r.materiaId,
      grupoId: r.grupoId,
      ...(r.sesion
        ? {
            sesion: {
              dia: r.sesion.dia,
              inicio: formatearHora(r.sesion.inicio),
              fin: formatearHora(r.sesion.fin),
            },
          }
        : {}),
    })),
  }));
}

/** Campos que marcan un horario no válido en el JSON. */
function validezAJson(validez: Validez) {
  return {
    validez: MARCA_NO_VALIDO,
    cumpleHastaNivel: validez.cumpleHastaNivel,
    criteriosNoCumplidos: criteriosAJson(validez),
  };
}

/** Líneas que marcan un horario no válido en el TXT. */
function lineasDeValidez(validez: Validez, sangria = ""): string[] {
  const nivel = Math.max(validez.cumpleHastaNivel, 0);
  return [
    `${sangria}${MARCA_NO_VALIDO}: cumple hasta el nivel ${nivel} de ${NIVEL_MAXIMO}`,
    ...validez.incumplimientos.map(
      (i) => `${sangria}No cumple: ${etiquetaDeCriterio(i.criterio)}${i.detalle ? ` (${i.detalle})` : ""}`,
    ),
  ];
}

/** Los datos del catálogo ya indexados por id (se arman una vez y se reutilizan en cada horario). */
export type IndiceCatalogo = {
  materias: Map<string, Materia>;
  grupos: Map<string, Grupo>;
  profesores: Map<string, Profesor>;
};

/** Indexa el catálogo una sola vez: buscar en las listas por cada línea del TXT sería cuadrático. */
export function indexarCatalogo(catalogo: Catalogo): IndiceCatalogo {
  return {
    materias: new Map(catalogo.materias.map((m) => [m.id, m])),
    grupos: new Map(catalogo.grupos.map((g) => [g.id, g])),
    profesores: new Map(catalogo.profesores.map((p) => [p.id, p])),
  };
}

function comoIndice(catalogo: Catalogo | IndiceCatalogo): IndiceCatalogo {
  return catalogo.materias instanceof Map ? (catalogo as IndiceCatalogo) : indexarCatalogo(catalogo as Catalogo);
}

/** Forma de un horario en el JSON de salida: `materias` en lugar de `asignaciones`. */
function horarioAJson(horario: Horario) {
  return {
    id: horario.id,
    materias: horario.asignaciones.map((a) => ({ materiaId: a.materiaId, grupoId: a.grupoId })),
    omitidas: horario.omitidas.map((o) => ({ materiaId: o.materiaId, razones: [...o.razones] })),
    creditosTotales: horario.creditosTotales,
  };
}

/**
 * ExportarJSON: texto JSON del resultado con la estructura de la sección 2.3. Con
 * `validezDe`, cada horario de `horariosNivelAlcanzado` lleva su marca "NO VÁLIDO".
 */
export function exportarJSON(resultado: Resultado, validezDe?: CalculoValidez): string {
  const salida: Record<string, unknown> = {
    estudianteId: resultado.estudianteId,
    estado: resultado.estado,
    criteriosActivos: resultado.criteriosActivos,
    motivo: resultado.motivo,
    horarios: resultado.horarios.map(horarioAJson),
  };

  if (resultado.estado === "ARCHIVO_INVALIDO") {
    salida.errores = resultado.errores;
  }
  if (resultado.estado === "SIN_HORARIO") {
    salida.nivelAlcanzado = resultado.nivelAlcanzado;
    salida.criteriosNoCumplidos = resultado.criteriosNoCumplidos;
    salida.horariosNivelAlcanzado = resultado.horariosNivelAlcanzado.map((horario) => ({
      ...horarioAJson(horario),
      ...(validezDe
        ? validezAJson(validezDe(horario))
        : { validez: MARCA_NO_VALIDO, cumpleHastaNivel: resultado.nivelAlcanzado }),
    }));
  }
  if (resultado.truncado) salida.truncado = true;
  return JSON.stringify(salida, null, 2);
}

/** Lista de líneas de un horario en el TXT (sin la línea del título). */
function lineasDeHorario(horario: Horario, indice: IndiceCatalogo): string[] {
  const lineas = [
    `Horario ${horario.id} (${horario.creditosTotales} ${horario.creditosTotales === 1 ? "crédito" : "créditos"})`,
  ];

  for (const asignacion of horario.asignaciones) {
    const materia = indice.materias.get(asignacion.materiaId);
    const grupo = indice.grupos.get(asignacion.grupoId);
    const profesor = grupo ? indice.profesores.get(grupo.profesorId) : undefined;

    lineas.push(`  ${asignacion.materiaId}  ${materia?.nombre ?? ""}  grupo ${asignacion.grupoId}`);
    lineas.push(`    profesor ${profesor?.nombre ?? grupo?.profesorId ?? ""}`);
    for (const sesion of grupo?.sesiones ?? []) {
      lineas.push(`    ${sesion.dia} ${formatearHora(sesion.inicio)} a ${formatearHora(sesion.fin)}`);
    }
  }

  const omitidas =
    horario.omitidas.length === 0
      ? "ninguna"
      : horario.omitidas
          .map((o) => (o.razones.length ? `${o.materiaId} (${o.razones.join("; ")})` : o.materiaId))
          .join(", ");
  lineas.push(`  Omitidas: ${omitidas}`);
  return lineas;
}

/**
 * ExportarTXT: texto plano del resultado. Necesita el catálogo para escribir
 * nombres de materias y profesores y las sesiones de cada grupo.
 */
export function exportarTXT(
  resultado: Resultado,
  catalogo: Catalogo | IndiceCatalogo | null,
  validezDe?: CalculoValidez,
): string {
  const lineas: string[] = [];
  const indice = catalogo ? comoIndice(catalogo) : null;

  if (resultado.estado === "ARCHIVO_INVALIDO") {
    lineas.push("ARCHIVO INVÁLIDO");
    lineas.push(`Errores: ${resultado.errores.length}`);
    for (const error of resultado.errores) {
      lineas.push("");
      lineas.push(`[${error.codigo}] ${error.ruta}`);
      lineas.push(`  Se esperaba: ${error.esperado}`);
      lineas.push(`  Se encontró: ${error.encontrado ?? "el campo no existe"}`);
    }
    return `${lineas.join("\n")}\n`;
  }

  lineas.push(`HORARIOS PARA ${resultado.estudianteId}`);
  lineas.push(`Estado: ${resultado.estado}`);
  lineas.push(
    `Criterios activos: ${resultado.criteriosActivos.length ? resultado.criteriosActivos.join(", ") : "ninguno"}`,
  );

  if (resultado.estado === "SIN_HORARIO") {
    lineas.push(`Motivo: ${resultado.motivo ?? ""}`);
    lineas.push("Horarios válidos: 0");
    const nivel = resultado.nivelAlcanzado ?? -1;
    if (nivel >= 0) lineas.push(`Cumple hasta el nivel ${nivel} de ${NIVEL_MAXIMO}`);
    if (resultado.criteriosNoCumplidos.length) {
      lineas.push(`Criterios no cumplidos: ${resultado.criteriosNoCumplidos.join(", ")}`);
    }
    if (indice && resultado.horariosNivelAlcanzado.length) {
      lineas.push(
        `Horarios que NO cumplen todos los criterios: ${resultado.horariosNivelAlcanzado.length}`,
      );
      for (const horario of resultado.horariosNivelAlcanzado) {
        lineas.push("");
        const [titulo, ...resto] = lineasDeHorario(horario, indice);
        lineas.push(`${titulo} - ${MARCA_NO_VALIDO}`);
        if (validezDe) lineas.push(...lineasDeValidez(validezDe(horario), "  ").slice(1));
        lineas.push(...resto);
      }
    }
    return `${lineas.join("\n")}\n`;
  }

  lineas.push(`Total de horarios: ${resultado.horarios.length}`);
  if (indice) {
    for (const horario of resultado.horarios) {
      lineas.push("");
      lineas.push(...lineasDeHorario(horario, indice));
    }
  }
  return `${lineas.join("\n")}\n`;
}

/**
 * Texto TXT de un solo horario (para descargarlo desde el calendario). Con `validez`
 * (horario no válido), la cabecera lo dice y lista los criterios que no cumple.
 */
export function exportarHorarioTXT(
  resultado: Resultado,
  horario: Horario,
  catalogo: Catalogo | IndiceCatalogo,
  validez?: Validez | null,
): string {
  const cabecera = [
    `HORARIO ${horario.id} PARA ${resultado.estudianteId}`,
    ...(validez ? lineasDeValidez(validez) : []),
    `Criterios activos: ${resultado.criteriosActivos.length ? resultado.criteriosActivos.join(", ") : "ninguno"}`,
    "",
  ];
  return `${[...cabecera, ...lineasDeHorario(horario, comoIndice(catalogo))].join("\n")}\n`;
}

/** JSON de un solo horario, con la misma forma que en la lista de resultados. */
export function exportarHorarioJSON(
  resultado: Resultado,
  horario: Horario,
  validez?: Validez | null,
): string {
  return JSON.stringify(
    {
      estudianteId: resultado.estudianteId,
      criteriosActivos: resultado.criteriosActivos,
      ...(validez ? validezAJson(validez) : {}),
      horario: horarioAJson(horario),
    },
    null,
    2,
  );
}
