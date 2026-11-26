/**
 * Caso de uso completo para la aplicación web: recibe el archivo JSON del
 * estudiante (texto o ya parseado), valida, ejecuta los 9 niveles y devuelve una
 * respuesta lista para enviar al navegador (todo serializable).
 *
 * La interfaz no repite ninguna regla del algoritmo: solo dibuja lo que llega aquí.
 *
 * La respuesta es COMPACTA: cada horario trae solo los ids de sus grupos, los
 * créditos y las materias omitidas. Con todos los horarios posibles (puede haber
 * decenas de miles) el detalle completo pesaría decenas de MB y no cabría en una
 * respuesta de Vercel (4,5 MB). La pantalla arma el detalle de los horarios que
 * muestra con el catálogo del archivo que ella misma subió (`vistaDeCompacto`), y los
 * textos de descarga también se arman bajo demanda (`exportar-bajo-demanda.ts`).
 */
import { ejecutar, SIN_LIMITE } from "../../domain/scheduling/generador.ts";
import {
  DIAS,
  type ErrorValidacion,
  type EstadoResultado,
  type Horario,
  type Omitida,
} from "../../domain/scheduling/modelo.ts";
import type { IndiceCatalogo } from "../../domain/scheduling/exportar.ts";
import { parsearJson, validarEntrada, ErrorDeValidacion } from "../../domain/scheduling/validacion.ts";

/** Una sesión lista para dibujar: día 1 (lunes) a 6 (sábado), minutos desde medianoche. */
export type SesionVista = { day: string; startMinute: number; endMinute: number };

export type MateriaVista = {
  courseId: string;
  nombre: string;
  sectionId: string;
  profesor: string;
  creditos: number;
  meetings: SesionVista[];
};

/**
 * Horario para la interfaz. `courses` conserva el nombre y la forma del módulo del
 * nivel 0 para que el calendario y los horarios ya guardados sigan funcionando.
 */
export type HorarioVista = {
  id: number;
  name: string;
  courses: { courseId: string; sectionId: string; meetings: SesionVista[] }[];
  materias: MateriaVista[];
  creditosTotales: number;
  omitidas: Omitida[];
};

/** Un horario tal como viaja del servidor a la pantalla: lo mínimo para reconstruirlo. */
export type HorarioCompacto = {
  id: number;
  /** Ids de los grupos elegidos (cada grupo ya dice de qué materia es). */
  grupos: string[];
  creditosTotales: number;
  omitidas: Omitida[];
};

export type RespuestaGeneracion = {
  estado: EstadoResultado;
  estudianteId: string | null;
  criteriosActivos: string[];
  motivo: string | null;
  errores: ErrorValidacion[];
  nivelAlcanzado: number | null;
  criteriosNoCumplidos: string[];
  truncado: boolean;
  horarios: HorarioCompacto[];
  horariosNivelAlcanzado: HorarioCompacto[];
};

export function compactar(horario: Horario): HorarioCompacto {
  return {
    id: horario.id,
    grupos: horario.asignaciones.map((a) => a.grupoId),
    creditosTotales: horario.creditosTotales,
    omitidas: horario.omitidas,
  };
}

/**
 * Detalle de un horario para dibujarlo (materias, profesor, sesiones). Necesita solo
 * los índices del catálogo, así que corre igual en el servidor y en el navegador.
 */
export function vistaDeCompacto(
  horario: HorarioCompacto,
  indice: Pick<IndiceCatalogo, "materias" | "grupos" | "profesores">,
): HorarioVista {
  const materias: MateriaVista[] = horario.grupos.map((grupoId) => {
    const grupo = indice.grupos.get(grupoId);
    const materiaId = grupo?.materiaId ?? "";
    const materia = indice.materias.get(materiaId);
    const profesor = grupo ? indice.profesores.get(grupo.profesorId) : undefined;
    return {
      courseId: materiaId,
      nombre: materia?.nombre ?? materiaId,
      sectionId: grupoId,
      profesor: profesor?.nombre ?? grupo?.profesorId ?? "",
      creditos: materia?.creditos ?? 0,
      meetings: (grupo?.sesiones ?? []).map((sesion) => ({
        day: String(DIAS.indexOf(sesion.dia) + 1),
        startMinute: sesion.inicio,
        endMinute: sesion.fin,
      })),
    };
  });

  return {
    id: horario.id,
    name: `Horario ${horario.id}`,
    courses: materias.map(({ courseId, sectionId, meetings }) => ({
      courseId,
      sectionId,
      meetings,
    })),
    materias,
    creditosTotales: horario.creditosTotales,
    omitidas: horario.omitidas,
  };
}

/**
 * Valida y ejecuta. Nunca lanza por datos inválidos: devuelve ARCHIVO_INVALIDO.
 * Sin `limite` se devuelven todos los horarios; un límite solo se usa si se pide.
 */
export function generarDesdeArchivo(
  fuente: unknown,
  limite: number = SIN_LIMITE,
): RespuestaGeneracion {
  const { resultado } = ejecutar(fuente, limite);

  return {
    estado: resultado.estado,
    estudianteId: resultado.estudianteId,
    criteriosActivos: resultado.criteriosActivos,
    motivo: resultado.motivo,
    errores: resultado.errores,
    nivelAlcanzado: resultado.nivelAlcanzado,
    criteriosNoCumplidos: resultado.criteriosNoCumplidos,
    truncado: resultado.truncado,
    horarios: resultado.horarios.map(compactar),
    horariosNivelAlcanzado: resultado.horariosNivelAlcanzado.map(compactar),
  };
}

/**
 * Solo valida (pantalla "Subir JSON"): devuelve la lista completa de errores.
 * NO ejecuta el algoritmo: validar un archivo grande no debe costar una búsqueda.
 */
export function validarArchivo(fuente: unknown): { errores: ErrorValidacion[] } {
  let valor: unknown = fuente;
  if (typeof fuente === "string") {
    try {
      valor = parsearJson(fuente);
    } catch (error) {
      if (error instanceof ErrorDeValidacion) return { errores: error.errores };
      throw error;
    }
  }
  return { errores: validarEntrada(valor).errores };
}
