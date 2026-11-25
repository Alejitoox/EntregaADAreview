/**
 * Modelo del dominio: los TADs de la entrega 1 (sección 3.2) como tipos de
 * TypeScript y sus operaciones como funciones puras. Nada aquí depende de
 * React, Next ni PostgreSQL.
 */

/* ------------------------------------------------------------------ */
/* Constantes del sistema                                             */
/* ------------------------------------------------------------------ */

/** Los seis días posibles, en el orden de la semana (lunes a sábado). */
export const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
export type Dia = (typeof DIAS)[number];

/** Ventana de almuerzo: constante del sistema, 13:00 a 14:00 (minutos 780 a 840). */
export const ALMUERZO_INICIO = 780;
export const ALMUERZO_FIN = 840;

export const MINUTOS_DEL_DIA = 1440;

export type Prioridad = "alta" | "media" | "baja";
export type TipoHuecos = "ninguno" | "cortos" | "indiferente";

/** Nombre de cada criterio de los niveles 3 a 8. */
export type Criterio = "almuerzo" | "huecos" | "franja" | "diasLibres" | "profesor" | "amigos";

/* ------------------------------------------------------------------ */
/* TADs del catálogo                                                  */
/* ------------------------------------------------------------------ */

/** TAD Materia. */
export type Materia = { id: string; nombre: string; creditos: number };

/** TAD Profesor. */
export type Profesor = { id: string; nombre: string };

/** TAD Sesion. Minutos desde la medianoche; intervalo semiabierto [inicio, fin). */
export type Sesion = { dia: Dia; inicio: number; fin: number };

/** TAD Grupo. */
export type Grupo = {
  id: string;
  materiaId: string;
  profesorId: string;
  cuposDisponibles: number;
  inscritos: string[];
  sesiones: Sesion[];
};

/** TAD Catalogo. */
export type Catalogo = { materias: Materia[]; profesores: Profesor[]; grupos: Grupo[] };

/* ------------------------------------------------------------------ */
/* TADs del perfil del estudiante                                     */
/* ------------------------------------------------------------------ */

/** TAD MateriaSolicitada. Lista vacía de profesores = le es indiferente. */
export type MateriaSolicitada = {
  materiaId: string;
  prioridad: Prioridad;
  profesoresPreferidos: string[];
};

/**
 * TAD Estudiante, ya con los valores neutros de la Tabla 2 aplicados:
 * `creditosMin` = 0, `creditosMax` = null (sin tope), `franja` = null (todo el
 * día), huecos indiferente, sin días libres, sin amigos.
 */
export type Estudiante = {
  id: string;
  semestre: number;
  creditosMin: number;
  creditosMax: number | null;
  materias: MateriaSolicitada[];
  franja: { inicio: number; fin: number } | null;
  huecos: { tipo: TipoHuecos; maxMinutos: number };
  diasLibres: Dia[];
  amigos: string[];
  minCoincidenciasAmigos: number;
};

/* ------------------------------------------------------------------ */
/* TADs de la salida                                                  */
/* ------------------------------------------------------------------ */

export type Asignacion = { materiaId: string; grupoId: string };
export type Omitida = { materiaId: string; razones: string[] };

/** TAD Horario. `id` empieza en 1 y sigue el orden final de la lista. */
export type Horario = {
  id: number;
  asignaciones: Asignacion[];
  omitidas: Omitida[];
  creditosTotales: number;
};

export const CODIGOS_ERROR = [
  "JSON_MAL_FORMADO",
  "ESTRUCTURA_INVALIDA",
  "CAMPO_FALTANTE",
  "TIPO_INCORRECTO",
  "VALOR_NO_PERMITIDO",
  "RANGO_INVALIDO",
  "REFERENCIA_INEXISTENTE",
  "DUPLICADO",
  "DEPENDENCIA_FALTANTE",
] as const;
export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** TAD ErrorValidacion. `encontrado` es null cuando el campo no existe. */
export type ErrorValidacion = {
  codigo: CodigoError;
  ruta: string;
  mensaje: string;
  esperado: string;
  encontrado: string | null;
};

export type EstadoResultado = "OK" | "SIN_HORARIO" | "ARCHIVO_INVALIDO";

/**
 * TAD Resultado. Los campos de la entrega 1 son `estudianteId`, `estado`,
 * `criteriosActivos`, `motivo`, `horarios` y `errores`. Los demás son una
 * extensión para la pantalla "nivel alcanzado / criterios no cumplidos".
 */
export type Resultado = {
  estudianteId: string | null;
  estado: EstadoResultado;
  criteriosActivos: Criterio[];
  motivo: string | null;
  horarios: Horario[];
  errores: ErrorValidacion[];
  /** Nivel más alto (0 a 8) para el que existe al menos un horario; -1 si ninguno; null si el archivo es inválido. */
  nivelAlcanzado: number | null;
  /** Criterios que impiden llegar al nivel 8 (vacío si el estado es OK). */
  criteriosNoCumplidos: string[];
  /** Horarios del nivel alcanzado cuando no se llegó al 8 (para mostrar la mejor aproximación). */
  horariosNivelAlcanzado: Horario[];
  /** True si la búsqueda se detuvo al llegar al límite de horarios pedido. */
  truncado: boolean;
};

/* ------------------------------------------------------------------ */
/* Operaciones del TAD Sesion                                         */
/* ------------------------------------------------------------------ */

/**
 * SeTraslapa: verdadero si son del mismo día y el mayor de los inicios es
 * menor que el menor de los fines. Si una termina justo cuando empieza la
 * otra, no se traslapan.
 */
export function sesionSeTraslapa(a: Sesion, b: Sesion): boolean {
  return a.dia === b.dia && Math.max(a.inicio, b.inicio) < Math.min(a.fin, b.fin);
}

/** Intersecta: la sesión ocupa algún minuto del intervalo [desde, hasta), en cualquier día. */
export function sesionIntersecta(sesion: Sesion, desde: number, hasta: number): boolean {
  return Math.max(sesion.inicio, desde) < Math.min(sesion.fin, hasta);
}

/** EstaDentroDe: la sesión cabe completa en el rango de horas [desde, hasta]. */
export function sesionEstaDentroDe(sesion: Sesion, desde: number, hasta: number): boolean {
  return desde <= sesion.inicio && sesion.fin <= hasta;
}

/* ------------------------------------------------------------------ */
/* Operaciones del TAD Grupo                                          */
/* ------------------------------------------------------------------ */

/** TieneCupos: el grupo admite más estudiantes. */
export function grupoTieneCupos(grupo: Grupo): boolean {
  return grupo.cuposDisponibles > 0;
}

/** SeTraslapaCon: alguna sesión de un grupo se traslapa con alguna del otro. */
export function grupoSeTraslapaCon(a: Grupo, b: Grupo): boolean {
  return a.sesiones.some((sa) => b.sesiones.some((sb) => sesionSeTraslapa(sa, sb)));
}

/** EstaInscrito: el estudiante ya está inscrito en el grupo. */
export function grupoEstaInscrito(grupo: Grupo, estudianteId: string): boolean {
  return grupo.inscritos.includes(estudianteId);
}

/* ------------------------------------------------------------------ */
/* Operaciones del TAD MateriaSolicitada                              */
/* ------------------------------------------------------------------ */

/** AceptaProfesor: lista vacía (indiferente) o contiene al profesor. */
export function materiaAceptaProfesor(materia: MateriaSolicitada, profesorId: string): boolean {
  return (
    materia.profesoresPreferidos.length === 0 || materia.profesoresPreferidos.includes(profesorId)
  );
}

/**
 * PosicionDeProfesor: lugar del profesor en la lista de preferidos (0 es la
 * primera opción). Si el profesor no está en la lista (solo pasa en niveles
 * menores que 7) cuenta como el último lugar posible.
 */
export function posicionDeProfesor(materia: MateriaSolicitada, profesorId: string): number {
  const posicion = materia.profesoresPreferidos.indexOf(profesorId);
  return posicion >= 0 ? posicion : materia.profesoresPreferidos.length;
}

/* ------------------------------------------------------------------ */
/* Operaciones del TAD Estudiante                                     */
/* ------------------------------------------------------------------ */

const ORDEN_CRITERIOS: readonly Criterio[] = [
  "almuerzo",
  "huecos",
  "franja",
  "diasLibres",
  "profesor",
  "amigos",
];

/** Nivel (3 a 8) en el que se evalúa cada criterio. */
export const NIVEL_DE_CRITERIO: Record<Criterio, number> = {
  almuerzo: 3,
  huecos: 4,
  franja: 5,
  diasLibres: 6,
  profesor: 7,
  amigos: 8,
};

/** FranjaEfectiva: la franja declarada, o el día completo si se omitió. */
export function franjaEfectiva(estudiante: Estudiante): { inicio: number; fin: number } {
  return estudiante.franja ?? { inicio: 0, fin: MINUTOS_DEL_DIA };
}

/**
 * CriteriosActivos: criterios de los niveles 3 a 8 que el estudiante declaró
 * (los que no son indiferentes). El almuerzo siempre está incluido.
 */
export function criteriosActivos(estudiante: Estudiante): Criterio[] {
  const activos = new Set<Criterio>(["almuerzo"]);
  if (estudiante.huecos.tipo !== "indiferente") activos.add("huecos");
  if (estudiante.franja !== null) activos.add("franja");
  if (estudiante.diasLibres.length > 0) activos.add("diasLibres");
  if (estudiante.materias.some((m) => m.profesoresPreferidos.length > 0)) activos.add("profesor");
  if (estudiante.amigos.length > 0 && estudiante.minCoincidenciasAmigos > 0) activos.add("amigos");
  return ORDEN_CRITERIOS.filter((criterio) => activos.has(criterio));
}
