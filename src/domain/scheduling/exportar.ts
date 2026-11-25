/**
 * Exportación del resultado (entrega 1, sección 2.3): JSON y TXT.
 *
 * El JSON sigue la Tabla 5. Cuando el estado no es OK se agregan campos extra
 * (`nivelAlcanzado`, `criteriosNoCumplidos`, `horariosNivelAlcanzado`) y cuando
 * el archivo es inválido se agrega la lista `errores`.
 */
import { formatearHora } from "./validacion.ts";
import type { Catalogo, Horario, Resultado } from "./modelo.ts";

/** Forma de un horario en el JSON de salida: `materias` en lugar de `asignaciones`. */
function horarioAJson(horario: Horario) {
  return {
    id: horario.id,
    materias: horario.asignaciones.map((a) => ({ materiaId: a.materiaId, grupoId: a.grupoId })),
    omitidas: horario.omitidas.map((o) => ({ materiaId: o.materiaId, razones: [...o.razones] })),
    creditosTotales: horario.creditosTotales,
  };
}

/** ExportarJSON: texto JSON del resultado con la estructura de la sección 2.3. */
export function exportarJSON(resultado: Resultado): string {
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
    salida.horariosNivelAlcanzado = resultado.horariosNivelAlcanzado.map(horarioAJson);
  }
  if (resultado.truncado) salida.truncado = true;
  return JSON.stringify(salida, null, 2);
}

/** Lista de líneas de un horario en el TXT (sin la línea del título). */
function lineasDeHorario(horario: Horario, catalogo: Catalogo): string[] {
  const lineas = [
    `Horario ${horario.id} (${horario.creditosTotales} ${horario.creditosTotales === 1 ? "crédito" : "créditos"})`,
  ];

  for (const asignacion of horario.asignaciones) {
    const materia = catalogo.materias.find((m) => m.id === asignacion.materiaId);
    const grupo = catalogo.grupos.find((g) => g.id === asignacion.grupoId);
    const profesor = catalogo.profesores.find((p) => p.id === grupo?.profesorId);

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
export function exportarTXT(resultado: Resultado, catalogo: Catalogo | null): string {
  const lineas: string[] = [];

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
    lineas.push(`Nivel alcanzado: ${resultado.nivelAlcanzado}`);
    if (resultado.criteriosNoCumplidos.length) {
      lineas.push(`Criterios no cumplidos: ${resultado.criteriosNoCumplidos.join(", ")}`);
    }
    if (catalogo && resultado.horariosNivelAlcanzado.length) {
      lineas.push(`Horarios del nivel alcanzado: ${resultado.horariosNivelAlcanzado.length}`);
      for (const horario of resultado.horariosNivelAlcanzado) {
        lineas.push("");
        lineas.push(...lineasDeHorario(horario, catalogo));
      }
    }
    return `${lineas.join("\n")}\n`;
  }

  lineas.push(`Total de horarios: ${resultado.horarios.length}`);
  if (catalogo) {
    for (const horario of resultado.horarios) {
      lineas.push("");
      lineas.push(...lineasDeHorario(horario, catalogo));
    }
  }
  return `${lineas.join("\n")}\n`;
}

/** Texto TXT de un solo horario (para descargarlo desde el calendario). */
export function exportarHorarioTXT(
  resultado: Resultado,
  horario: Horario,
  catalogo: Catalogo,
): string {
  const cabecera = [
    `HORARIO ${horario.id} PARA ${resultado.estudianteId}`,
    `Criterios activos: ${resultado.criteriosActivos.length ? resultado.criteriosActivos.join(", ") : "ninguno"}`,
    "",
  ];
  return `${[...cabecera, ...lineasDeHorario(horario, catalogo)].join("\n")}\n`;
}

/** JSON de un solo horario, con la misma forma que en la lista de resultados. */
export function exportarHorarioJSON(resultado: Resultado, horario: Horario): string {
  return JSON.stringify(
    {
      estudianteId: resultado.estudianteId,
      criteriosActivos: resultado.criteriosActivos,
      horario: horarioAJson(horario),
    },
    null,
    2,
  );
}
