/**
 * Niveles 0 a 8 (entrega 1, sección 2.4).
 *
 * Cada nivel es un predicado independiente sobre una SELECCIÓN: la lista de
 * grupos elegidos, a lo sumo uno por materia. Los niveles son acumulativos:
 * `cumpleNivel(k, ...)` exige los criterios 0 a k. Todos son filtros estrictos,
 * no puntajes. Un criterio que el estudiante no declaró se cumple siempre.
 *
 * Estas funciones son la definición "de referencia" del problema. La búsqueda
 * (generador.ts) usa podas para ir más rápido, pero siempre termina validando
 * cada candidato con `cumpleNivel`, y las pruebas la comparan contra fuerza
 * bruta que usa estas mismas funciones.
 */
import {
  ALMUERZO_FIN,
  ALMUERZO_INICIO,
  franjaEfectiva,
  grupoEstaInscrito,
  grupoSeTraslapaCon,
  grupoTieneCupos,
  materiaAceptaProfesor,
  posicionDeProfesor,
  sesionEstaDentroDe,
  sesionIntersecta,
  DIAS,
  type Dia,
  type Grupo,
  type MateriaSolicitada,
} from "./modelo.ts";
import type { Instancia } from "./preprocesamiento.ts";

/** Grupos elegidos, a lo sumo uno por materia. */
export type Seleccion = readonly Grupo[];

export const NIVEL_MAXIMO = 8;

/** Nombre legible de lo que se evalúa en cada nivel. */
export const NOMBRE_DE_NIVEL: readonly string[] = [
  "restriccionesDuras", // 0
  "prioridad", // 1
  "creditos", // 2
  "almuerzo", // 3
  "huecos", // 4
  "franja", // 5
  "diasLibres", // 6
  "profesor", // 7
  "amigos", // 8
];

/* ------------------------------------------------------------------ */
/* Utilidades sobre una selección                                     */
/* ------------------------------------------------------------------ */

export function creditosTotales(seleccion: Seleccion, instancia: Instancia): number {
  return seleccion.reduce((suma, g) => suma + (instancia.materias.get(g.materiaId)?.creditos ?? 0), 0);
}

function creditosDeMateria(materiaId: string, instancia: Instancia): number {
  return instancia.materias.get(materiaId)?.creditos ?? 0;
}

function solicitadaDe(materiaId: string, instancia: Instancia): MateriaSolicitada | undefined {
  return instancia.estudiante.materias.find((m) => m.materiaId === materiaId);
}

/** Verdadero si algún par de grupos de la selección tiene sesiones que se cruzan. */
export function tieneTraslapes(seleccion: Seleccion): boolean {
  for (let a = 0; a < seleccion.length; a += 1) {
    for (let b = a + 1; b < seleccion.length; b += 1) {
      if (grupoSeTraslapaCon(seleccion[a], seleccion[b])) return true;
    }
  }
  return false;
}

/**
 * Huecos de un día: tiempo libre en minutos entre cada par de sesiones
 * consecutivas, sin contar los minutos que caen dentro del almuerzo. Solo se
 * evalúan pares consecutivos del mismo día.
 */
export function huecosDelDia(seleccion: Seleccion, dia: Dia): number[] {
  const sesiones = seleccion
    .flatMap((g) => g.sesiones)
    .filter((s) => s.dia === dia)
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);

  const huecos: number[] = [];
  for (let i = 0; i + 1 < sesiones.length; i += 1) {
    const desde = sesiones[i].fin;
    const hasta = sesiones[i + 1].inicio;
    const libre = Math.max(0, hasta - desde);
    const enAlmuerzo = Math.max(0, Math.min(hasta, ALMUERZO_FIN) - Math.max(desde, ALMUERZO_INICIO));
    huecos.push(Math.max(0, libre - enAlmuerzo));
  }
  return huecos;
}

/** ContarCoincidenciasAmigos: parejas (amigo, materia) con el amigo inscrito en el grupo asignado. */
export function contarCoincidenciasAmigos(seleccion: Seleccion, instancia: Instancia): number {
  let coincidencias = 0;
  for (const grupo of seleccion) {
    for (const amigo of instancia.estudiante.amigos) {
      if (grupoEstaInscrito(grupo, amigo)) coincidencias += 1;
    }
  }
  return coincidencias;
}

/**
 * SumaPosicionesProfesor: qué tan alto quedaron los profesores preferidos. La
 * primera opción vale 0, la segunda 1, etc. Las materias sin lista no suman.
 */
export function sumaPosicionesProfesor(seleccion: Seleccion, instancia: Instancia): number {
  let suma = 0;
  for (const grupo of seleccion) {
    const solicitada = solicitadaDe(grupo.materiaId, instancia);
    if (solicitada && solicitada.profesoresPreferidos.length > 0) {
      suma += posicionDeProfesor(solicitada, grupo.profesorId);
    }
  }
  return suma;
}

/** Un grupo se puede agregar a una base si tiene cupos y no se cruza con ninguno de sus grupos. */
function sePuedeAgregar(grupo: Grupo, base: Seleccion): boolean {
  return grupoTieneCupos(grupo) && !base.some((otro) => grupoSeTraslapaCon(grupo, otro));
}

/* ------------------------------------------------------------------ */
/* Un predicado por nivel                                             */
/* ------------------------------------------------------------------ */

/** Nivel 0: sin traslapes y todo grupo asignado con cupos disponibles. */
export function cumpleNivel0(seleccion: Seleccion): boolean {
  return seleccion.every(grupoTieneCupos) && !tieneTraslapes(seleccion);
}

/**
 * Nivel 1: prioridad de las materias.
 *  (a) toda materia alta está incluida;
 *  (b) maximalidad: si una materia media o baja quedó omitida, ningún grupo
 *      suyo se puede agregar sin romper el nivel 0 ni superar el máximo de créditos;
 *  (c) las medias tienen preferencia sobre las bajas: si una media quedó
 *      omitida, no se puede cambiar una baja incluida por un grupo de esa media
 *      sin romper el nivel 0 ni superar el máximo de créditos.
 */
export function cumpleNivel1(seleccion: Seleccion, instancia: Instancia): boolean {
  const incluidas = new Set(seleccion.map((g) => g.materiaId));
  const perfil = instancia.estudiante.materias;
  const maximo = instancia.estudiante.creditosMax;
  const creditos = creditosTotales(seleccion, instancia);

  // (a) altas incluidas
  for (const m of perfil) {
    if (m.prioridad === "alta" && !incluidas.has(m.materiaId)) return false;
  }

  // (b) maximalidad
  for (const m of perfil) {
    if (incluidas.has(m.materiaId)) continue;
    const extra = creditosDeMateria(m.materiaId, instancia);
    if (maximo !== null && creditos + extra > maximo) continue;
    for (const g of instancia.gruposDe.get(m.materiaId) ?? []) {
      if (sePuedeAgregar(g, seleccion)) return false;
    }
  }

  // (c) medias antes que bajas
  for (const media of perfil) {
    if (media.prioridad !== "media" || incluidas.has(media.materiaId)) continue;
    for (const grupoBaja of seleccion) {
      const baja = solicitadaDe(grupoBaja.materiaId, instancia);
      if (!baja || baja.prioridad !== "baja") continue;

      const base = seleccion.filter((g) => g !== grupoBaja);
      const nuevos =
        creditos -
        creditosDeMateria(grupoBaja.materiaId, instancia) +
        creditosDeMateria(media.materiaId, instancia);
      if (maximo !== null && nuevos > maximo) continue;
      for (const g of instancia.gruposDe.get(media.materiaId) ?? []) {
        if (sePuedeAgregar(g, base)) return false;
      }
    }
  }
  return true;
}

/** Nivel 2: créditos totales entre el mínimo y el máximo del estudiante. */
export function cumpleNivel2(seleccion: Seleccion, instancia: Instancia): boolean {
  const creditos = creditosTotales(seleccion, instancia);
  const { creditosMin, creditosMax } = instancia.estudiante;
  return creditos >= creditosMin && (creditosMax === null || creditos <= creditosMax);
}

/** Un grupo respeta el almuerzo si ninguna de sus sesiones toca 13:00 a 14:00. */
export function grupoRespetaAlmuerzo(grupo: Grupo): boolean {
  return !grupo.sesiones.some((s) => sesionIntersecta(s, ALMUERZO_INICIO, ALMUERZO_FIN));
}

/** Nivel 3: almuerzo protegido. */
export function cumpleNivel3(seleccion: Seleccion): boolean {
  return seleccion.every(grupoRespetaAlmuerzo);
}

/** Nivel 4: huecos (ninguno / cortos / indiferente). */
export function cumpleNivel4(seleccion: Seleccion, instancia: Instancia): boolean {
  const { tipo, maxMinutos } = instancia.estudiante.huecos;
  if (tipo === "indiferente") return true;
  const limite = tipo === "ninguno" ? 0 : maxMinutos;
  return DIAS.every((dia) => huecosDelDia(seleccion, dia).every((hueco) => hueco <= limite));
}

/** Un grupo cabe en la franja preferida si todas sus sesiones empiezan y terminan dentro de ella. */
export function grupoCabeEnFranja(grupo: Grupo, instancia: Instancia): boolean {
  const { inicio, fin } = franjaEfectiva(instancia.estudiante);
  return grupo.sesiones.every((s) => sesionEstaDentroDe(s, inicio, fin));
}

/** Nivel 5: franja horaria. */
export function cumpleNivel5(seleccion: Seleccion, instancia: Instancia): boolean {
  return seleccion.every((g) => grupoCabeEnFranja(g, instancia));
}

/** Un grupo respeta los días libres si no tiene ninguna sesión en esos días. */
export function grupoRespetaDiasLibres(grupo: Grupo, instancia: Instancia): boolean {
  return !grupo.sesiones.some((s) => instancia.estudiante.diasLibres.includes(s.dia));
}

/** Nivel 6: días libres. */
export function cumpleNivel6(seleccion: Seleccion, instancia: Instancia): boolean {
  return seleccion.every((g) => grupoRespetaDiasLibres(g, instancia));
}

/** Un grupo cumple la preferencia de profesor si su profesor está en la lista (o no hay lista). */
export function grupoCumpleProfesor(grupo: Grupo, instancia: Instancia): boolean {
  const solicitada = solicitadaDe(grupo.materiaId, instancia);
  return !solicitada || materiaAceptaProfesor(solicitada, grupo.profesorId);
}

/** Nivel 7: profesor. */
export function cumpleNivel7(seleccion: Seleccion, instancia: Instancia): boolean {
  return seleccion.every((g) => grupoCumpleProfesor(g, instancia));
}

/** Nivel 8: coincidencias con amigos >= mínimo (si no hay amigos o el mínimo es 0, siempre). */
export function cumpleNivel8(seleccion: Seleccion, instancia: Instancia): boolean {
  const { amigos, minCoincidenciasAmigos } = instancia.estudiante;
  if (amigos.length === 0 || minCoincidenciasAmigos === 0) return true;
  return contarCoincidenciasAmigos(seleccion, instancia) >= minCoincidenciasAmigos;
}

/**
 * CumpleNivel(nivel): verdadero si la selección cumple los criterios definidos
 * hasta ese nivel, es decir, los niveles 0, 1, …, nivel.
 */
export function cumpleNivel(nivel: number, seleccion: Seleccion, instancia: Instancia): boolean {
  if (!Number.isInteger(nivel) || nivel < 0 || nivel > NIVEL_MAXIMO) {
    throw new RangeError("El nivel debe ser un entero entre 0 y 8");
  }
  if (!cumpleNivel0(seleccion)) return false;
  if (nivel >= 1 && !cumpleNivel1(seleccion, instancia)) return false;
  if (nivel >= 2 && !cumpleNivel2(seleccion, instancia)) return false;
  if (nivel >= 3 && !cumpleNivel3(seleccion)) return false;
  if (nivel >= 4 && !cumpleNivel4(seleccion, instancia)) return false;
  if (nivel >= 5 && !cumpleNivel5(seleccion, instancia)) return false;
  if (nivel >= 6 && !cumpleNivel6(seleccion, instancia)) return false;
  if (nivel >= 7 && !cumpleNivel7(seleccion, instancia)) return false;
  if (nivel >= 8 && !cumpleNivel8(seleccion, instancia)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Razones de omisión                                                 */
/* ------------------------------------------------------------------ */

/**
 * Razones comprobadas por las que una materia del perfil quedó fuera de una
 * selección. Solo se informan causas verificables, y si hay varias se listan
 * todas (cada una bloquea al menos un grupo de la materia):
 *  - "supera creditosMax": agregar la materia pasaría el máximo de créditos;
 *  - "sin cupos": algún grupo no tiene cupos;
 *  - "se cruza con X, Y": algún grupo se traslapa con las materias X, Y del horario.
 */
export function razonesDeOmision(
  materiaId: string,
  seleccion: Seleccion,
  instancia: Instancia,
): string[] {
  const grupos = instancia.gruposDe.get(materiaId) ?? [];
  const razones: string[] = [];

  const maximo = instancia.estudiante.creditosMax;
  if (
    maximo !== null &&
    creditosTotales(seleccion, instancia) + creditosDeMateria(materiaId, instancia) > maximo
  ) {
    razones.push("supera creditosMax");
  }
  if (grupos.some((g) => !grupoTieneCupos(g))) razones.push("sin cupos");

  const cruzadas = new Set<string>();
  for (const g of grupos) {
    for (const otro of seleccion) {
      if (grupoSeTraslapaCon(g, otro)) cruzadas.add(otro.materiaId);
    }
  }
  if (cruzadas.size > 0) razones.push(`se cruza con ${[...cruzadas].sort().join(", ")}`);
  return razones;
}
