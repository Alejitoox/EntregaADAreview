/**
 * Caso de uso completo para la aplicación web: recibe el archivo JSON del
 * estudiante (texto o ya parseado), valida, ejecuta los 9 niveles y devuelve una
 * respuesta lista para enviar al navegador (todo serializable).
 *
 * La interfaz no repite ninguna regla del algoritmo: solo dibuja lo que llega aquí.
 */
import { ejecutar, LIMITE_POR_DEFECTO } from "../../domain/scheduling/generador.ts";
import {
  exportarHorarioJSON,
  exportarHorarioTXT,
  exportarJSON,
  exportarTXT,
} from "../../domain/scheduling/exportar.ts";
import {
  DIAS,
  type Catalogo,
  type ErrorValidacion,
  type EstadoResultado,
  type Horario,
  type Omitida,
  type Resultado,
} from "../../domain/scheduling/modelo.ts";
import { validarEntrada } from "../../domain/scheduling/validacion.ts";

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
  json: string;
  txt: string;
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
  horarios: HorarioVista[];
  horariosNivelAlcanzado: HorarioVista[];
  /** Resultado completo, para el botón de descarga de la lista. */
  descargas: { json: string; txt: string };
};

function vistaDeHorario(horario: Horario, resultado: Resultado, catalogo: Catalogo): HorarioVista {
  const materias: MateriaVista[] = horario.asignaciones.map((asignacion) => {
    const grupo = catalogo.grupos.find((g) => g.id === asignacion.grupoId);
    const materia = catalogo.materias.find((m) => m.id === asignacion.materiaId);
    const profesor = catalogo.profesores.find((p) => p.id === grupo?.profesorId);
    return {
      courseId: asignacion.materiaId,
      nombre: materia?.nombre ?? asignacion.materiaId,
      sectionId: asignacion.grupoId,
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
    json: exportarHorarioJSON(resultado, horario),
    txt: exportarHorarioTXT(resultado, horario, catalogo),
  };
}

/** Valida y ejecuta. Nunca lanza por datos inválidos: devuelve ARCHIVO_INVALIDO. */
export function generarDesdeArchivo(
  fuente: unknown,
  limite: number = LIMITE_POR_DEFECTO,
): RespuestaGeneracion {
  const { resultado, instancia } = ejecutar(fuente, limite);
  const catalogo = instancia?.catalogo ?? null;
  const vistas = (horarios: Horario[]) =>
    catalogo ? horarios.map((h) => vistaDeHorario(h, resultado, catalogo)) : [];

  return {
    estado: resultado.estado,
    estudianteId: resultado.estudianteId,
    criteriosActivos: resultado.criteriosActivos,
    motivo: resultado.motivo,
    errores: resultado.errores,
    nivelAlcanzado: resultado.nivelAlcanzado,
    criteriosNoCumplidos: resultado.criteriosNoCumplidos,
    truncado: resultado.truncado,
    horarios: vistas(resultado.horarios),
    horariosNivelAlcanzado: vistas(resultado.horariosNivelAlcanzado),
    descargas: { json: exportarJSON(resultado), txt: exportarTXT(resultado, catalogo) },
  };
}

/** Solo valida (pantalla "Subir JSON"): devuelve la lista completa de errores. */
export function validarArchivo(fuente: unknown): { errores: ErrorValidacion[] } {
  if (typeof fuente === "string") {
    return { errores: ejecutar(fuente).resultado.errores };
  }
  return { errores: validarEntrada(fuente).errores };
}
