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
  type Sesion,
} from "./modelo.ts";
import type { Instancia } from "./preprocesamiento.ts";
import { formatearHora } from "./validacion.ts";

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

/** Nombre para el usuario de cada criterio (pantalla y descargas). */
const ETIQUETA_DE_CRITERIO: Record<string, string> = {
  restriccionesDuras: "Restricciones duras",
  prioridad: "Prioridad de materias",
  creditos: "Créditos",
  almuerzo: "Almuerzo libre",
  huecos: "Huecos",
  franja: "Franja horaria",
  diasLibres: "Días libres",
  profesor: "Profesor preferido",
  amigos: "Amigos",
};

export function etiquetaDeCriterio(criterio: string): string {
  return ETIQUETA_DE_CRITERIO[criterio] ?? criterio;
}

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
  return instancia.solicitadasPorId.get(materiaId);
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
    // Se calculó una vez por grupo al preprocesar (con conjuntos); el respaldo cubre
    // grupos que no vienen del catálogo de la instancia.
    coincidencias +=
      instancia.coincidenciasAmigosPorGrupo.get(grupo.id) ??
      instancia.estudiante.amigos.filter((amigo) => grupoEstaInscrito(grupo, amigo)).length;
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
 * Verdadero si `base + grupo` cumple el nivel 0 y los niveles 2 a `hasta` (todos
 * menos el 1). Supone que `base` ya cumple el nivel 0. Es la pregunta que hace la
 * maximalidad: "¿este cambio deja un horario que también cumple lo que está en juego?".
 */
function agregadoCumple(base: Seleccion, grupo: Grupo, hasta: number, instancia: Instancia): boolean {
  if (!sePuedeAgregar(grupo, base)) return false; // nivel 0
  const nueva = [...base, grupo];
  for (let nivel = 2; nivel <= hasta; nivel += 1) {
    if (!cumpleSoloNivel(nivel, nueva, instancia)) return false;
  }
  return true;
}

/**
 * Nivel 1: prioridad de las materias, evaluada para la versión del nivel `hasta`.
 *  (a) toda materia alta está incluida;
 *  (b) maximalidad: si una materia media o baja quedó omitida, ningún grupo suyo
 *      se puede agregar dejando un horario que cumpla el nivel 0 y los niveles 2 a
 *      `hasta`;
 *  (c) las medias tienen preferencia sobre las bajas: si una media quedó omitida,
 *      no se puede cambiar una baja incluida por un grupo de esa media dejando un
 *      horario que cumpla el nivel 0 y los niveles 2 a `hasta`.
 *
 * Una materia omitida solo obliga a entrar (o a desplazar una baja) si el horario
 * resultante también cumple los demás criterios en juego. Así, una baja cuyo único
 * grupo cae en un día libre no impide el horario sin ella (en la versión final).
 *
 * Consecuencia: los conjuntos V_k ya no están anidados (un horario del nivel 6
 * puede no estar en el nivel 5, porque en el 5 se le exigía una materia que en el 6
 * rompe los días libres). Lo que sí se conserva es que "V_k tiene algún horario"
 * es monótono; ver `generarHorarios` en generador.ts.
 */
export function cumpleNivel1(
  seleccion: Seleccion,
  instancia: Instancia,
  hasta: number = NIVEL_MAXIMO,
): boolean {
  const incluidas = new Set(seleccion.map((g) => g.materiaId));
  const perfil = instancia.estudiante.materias;

  // (a) altas incluidas
  for (const m of perfil) {
    if (m.prioridad === "alta" && !incluidas.has(m.materiaId)) return false;
  }

  // Si la selección ya rompe el nivel 0, ningún cambio la arregla: (b) y (c) no aplican.
  if (!cumpleNivel0(seleccion)) return true;

  // (b) maximalidad
  for (const m of perfil) {
    if (incluidas.has(m.materiaId)) continue;
    for (const g of instancia.gruposDe.get(m.materiaId) ?? []) {
      if (agregadoCumple(seleccion, g, hasta, instancia)) return false;
    }
  }

  // (c) medias antes que bajas
  for (const media of perfil) {
    if (media.prioridad !== "media" || incluidas.has(media.materiaId)) continue;
    for (const grupoBaja of seleccion) {
      const baja = solicitadaDe(grupoBaja.materiaId, instancia);
      if (!baja || baja.prioridad !== "baja") continue;
      const base = seleccion.filter((g) => g !== grupoBaja);
      for (const g of instancia.gruposDe.get(media.materiaId) ?? []) {
        if (agregadoCumple(base, g, hasta, instancia)) return false;
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
  // Los niveles 2 a k se revisan antes que el 1: son baratos y casi siempre descartan primero.
  if (nivel >= 2 && !cumpleNivel2(seleccion, instancia)) return false;
  if (nivel >= 3 && !cumpleNivel3(seleccion)) return false;
  if (nivel >= 4 && !cumpleNivel4(seleccion, instancia)) return false;
  if (nivel >= 5 && !cumpleNivel5(seleccion, instancia)) return false;
  if (nivel >= 6 && !cumpleNivel6(seleccion, instancia)) return false;
  if (nivel >= 7 && !cumpleNivel7(seleccion, instancia)) return false;
  if (nivel >= 8 && !cumpleNivel8(seleccion, instancia)) return false;
  // La maximalidad del nivel k se mide contra los criterios hasta k.
  if (nivel >= 1 && !cumpleNivel1(seleccion, instancia, nivel)) return false;
  return true;
}

/**
 * Solo el predicado del nivel k, sin exigir los anteriores. Sirve para
 * diagnosticar: saber si un criterio concreto se cumple por sí mismo. El nivel 1
 * se evalúa en su forma final (maximalidad contra los niveles 2 a 8).
 */
export function cumpleSoloNivel(nivel: number, seleccion: Seleccion, instancia: Instancia): boolean {
  switch (nivel) {
    case 0:
      return cumpleNivel0(seleccion);
    case 1:
      return cumpleNivel1(seleccion, instancia);
    case 2:
      return cumpleNivel2(seleccion, instancia);
    case 3:
      return cumpleNivel3(seleccion);
    case 4:
      return cumpleNivel4(seleccion, instancia);
    case 5:
      return cumpleNivel5(seleccion, instancia);
    case 6:
      return cumpleNivel6(seleccion, instancia);
    case 7:
      return cumpleNivel7(seleccion, instancia);
    case 8:
      return cumpleNivel8(seleccion, instancia);
    default:
      throw new RangeError("El nivel debe ser un entero entre 0 y 8");
  }
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

  // Criterios de los niveles 3 a 7 (desde el ajuste a la maximalidad del nivel 1, una
  // materia también puede quedar fuera porque meterla rompería uno de ellos). Solo se
  // informan los que el estudiante declaró; el almuerzo siempre está activo.
  const { estudiante } = instancia;
  if (grupos.some((g) => !grupoRespetaAlmuerzo(g))) razones.push("choca con el almuerzo");
  if (
    estudiante.huecos.tipo !== "indiferente" &&
    cumpleNivel4(seleccion, instancia) &&
    grupos.some((g) => !cumpleNivel4([...seleccion, g], instancia))
  ) {
    razones.push(
      estudiante.huecos.tipo === "ninguno"
        ? "deja huecos entre clases"
        : `deja huecos de más de ${estudiante.huecos.maxMinutos} min`,
    );
  }
  if (estudiante.franja !== null && grupos.some((g) => !grupoCabeEnFranja(g, instancia))) {
    razones.push(
      `fuera de la franja ${formatearHora(estudiante.franja.inicio)} a ${formatearHora(estudiante.franja.fin)}`,
    );
  }
  const diasOcupados = new Set(
    grupos.flatMap((g) => g.sesiones.map((s) => s.dia)).filter((d) => estudiante.diasLibres.includes(d)),
  );
  if (diasOcupados.size > 0) {
    const dias = DIAS.filter((d) => diasOcupados.has(d));
    razones.push(`tiene clase en día libre (${dias.join(", ")})`);
  }
  if (grupos.some((g) => !grupoCumpleProfesor(g, instancia))) razones.push("profesor no preferido");
  return razones;
}

/* ------------------------------------------------------------------ */
/* Criterios que incumple un horario                                  */
/* ------------------------------------------------------------------ */

/** Materia, grupo y sesión que hacen que un criterio no se cumpla (lo que se resalta). */
export type Responsable = { materiaId: string; grupoId: string | null; sesion: Sesion | null };

/** Un criterio que el horario no cumple, con su explicación y sus responsables. */
export type Incumplimiento = {
  nivel: number;
  /** Nombre del criterio, igual que en `NOMBRE_DE_NIVEL`. */
  criterio: string;
  /** Texto para el usuario, p. ej. "Inglés, grupo ING-02, el viernes 08:00 a 10:00". */
  detalle: string;
  responsables: Responsable[];
};

function nombreDe(materiaId: string, instancia: Instancia): string {
  return instancia.materias.get(materiaId)?.nombre ?? materiaId;
}

function textoSesion(grupo: Grupo, sesion: Sesion, instancia: Instancia): string {
  return `${nombreDe(grupo.materiaId, instancia)}, grupo ${grupo.id}, el ${sesion.dia} ${formatearHora(sesion.inicio)} a ${formatearHora(sesion.fin)}`;
}

/** Sesiones de la selección que no cumplen una condición, como incumplimiento. */
function porSesion(
  nivel: number,
  seleccion: Seleccion,
  instancia: Instancia,
  incumple: (sesion: Sesion) => boolean,
  sufijo = "",
): Incumplimiento {
  const responsables: Responsable[] = [];
  const textos: string[] = [];
  for (const grupo of seleccion) {
    for (const sesion of grupo.sesiones) {
      if (!incumple(sesion)) continue;
      responsables.push({ materiaId: grupo.materiaId, grupoId: grupo.id, sesion });
      textos.push(textoSesion(grupo, sesion, instancia));
    }
  }
  return { nivel, criterio: NOMBRE_DE_NIVEL[nivel], detalle: textos.join("; ") + sufijo, responsables };
}

/**
 * Criterios que un horario NO cumple, de los niveles 0 a 8, con la materia, el
 * grupo o la sesión que rompe cada uno. Los criterios que el estudiante no declaró
 * se cumplen siempre, así que nunca aparecen. Un horario válido devuelve [].
 *
 * Sirve para explicar por qué un horario de `horariosNivelAlcanzado` no es válido:
 * en la pantalla ("No cumple: Días libres (Inglés el viernes)"), en el calendario
 * (se resaltan las sesiones responsables) y en las descargas.
 */
export function criteriosIncumplidosDe(seleccion: Seleccion, instancia: Instancia): Incumplimiento[] {
  const salida: Incumplimiento[] = [];
  const { estudiante } = instancia;

  // Nivel 0: cupos y cruces.
  if (!cumpleNivel0(seleccion)) {
    const responsables: Responsable[] = [];
    const textos: string[] = [];
    for (const g of seleccion) {
      if (!grupoTieneCupos(g)) {
        responsables.push({ materiaId: g.materiaId, grupoId: g.id, sesion: null });
        textos.push(`${nombreDe(g.materiaId, instancia)}, grupo ${g.id}, no tiene cupos`);
      }
    }
    for (let a = 0; a < seleccion.length; a += 1) {
      for (let b = a + 1; b < seleccion.length; b += 1) {
        if (!grupoSeTraslapaCon(seleccion[a], seleccion[b])) continue;
        for (const g of [seleccion[a], seleccion[b]]) {
          responsables.push({ materiaId: g.materiaId, grupoId: g.id, sesion: null });
        }
        textos.push(
          `${nombreDe(seleccion[a].materiaId, instancia)} y ${nombreDe(seleccion[b].materiaId, instancia)} se cruzan`,
        );
      }
    }
    salida.push({ nivel: 0, criterio: NOMBRE_DE_NIVEL[0], detalle: textos.join("; "), responsables });
  }

  // Nivel 1: altas que faltan y materias que debían entrar.
  if (!cumpleNivel1(seleccion, instancia)) {
    const incluidas = new Set(seleccion.map((g) => g.materiaId));
    const responsables: Responsable[] = [];
    const textos: string[] = [];
    for (const m of estudiante.materias) {
      if (m.prioridad !== "alta" || incluidas.has(m.materiaId)) continue;
      responsables.push({ materiaId: m.materiaId, grupoId: null, sesion: null });
      const sinGrupos = !instancia.gruposDe.has(m.materiaId);
      textos.push(
        `falta la materia alta ${nombreDe(m.materiaId, instancia)} (${m.materiaId})${sinGrupos ? ": no tiene grupos en el catálogo" : ""}`,
      );
    }
    if (cumpleNivel0(seleccion)) {
      for (const m of estudiante.materias) {
        if (m.prioridad === "alta" || incluidas.has(m.materiaId)) continue;
        const grupo = (instancia.gruposDe.get(m.materiaId) ?? []).find((g) =>
          agregadoCumple(seleccion, g, NIVEL_MAXIMO, instancia),
        );
        if (grupo) {
          responsables.push({ materiaId: m.materiaId, grupoId: grupo.id, sesion: null });
          textos.push(`${nombreDe(m.materiaId, instancia)} se podía agregar (grupo ${grupo.id})`);
        }
      }
    }
    salida.push({ nivel: 1, criterio: NOMBRE_DE_NIVEL[1], detalle: textos.join("; "), responsables });
  }

  // Nivel 2: créditos.
  if (!cumpleNivel2(seleccion, instancia)) {
    const creditos = creditosTotales(seleccion, instancia);
    const limite =
      creditos < estudiante.creditosMin
        ? `mínimo ${estudiante.creditosMin}`
        : `máximo ${estudiante.creditosMax}`;
    salida.push({
      nivel: 2,
      criterio: NOMBRE_DE_NIVEL[2],
      detalle: `${creditos} ${creditos === 1 ? "crédito" : "créditos"}; ${limite}`,
      responsables: [],
    });
  }

  // Nivel 3: almuerzo.
  if (!cumpleNivel3(seleccion)) {
    salida.push(
      porSesion(3, seleccion, instancia, (s) => sesionIntersecta(s, ALMUERZO_INICIO, ALMUERZO_FIN)),
    );
  }

  // Nivel 4: huecos entre sesiones consecutivas del mismo día.
  if (!cumpleNivel4(seleccion, instancia)) {
    const limite = estudiante.huecos.tipo === "ninguno" ? 0 : estudiante.huecos.maxMinutos;
    const responsables: Responsable[] = [];
    const textos: string[] = [];
    for (const dia of DIAS) {
      const sesiones = seleccion
        .flatMap((g) => g.sesiones.filter((s) => s.dia === dia).map((sesion) => ({ g, sesion })))
        .sort((a, b) => a.sesion.inicio - b.sesion.inicio || a.sesion.fin - b.sesion.fin);
      const huecos = huecosDelDia(seleccion, dia);
      huecos.forEach((hueco, i) => {
        if (hueco <= limite) return;
        const [antes, despues] = [sesiones[i], sesiones[i + 1]];
        for (const { g, sesion } of [antes, despues]) {
          responsables.push({ materiaId: g.materiaId, grupoId: g.id, sesion });
        }
        textos.push(
          `${hueco} min el ${dia} entre ${nombreDe(antes.g.materiaId, instancia)} y ${nombreDe(despues.g.materiaId, instancia)}`,
        );
      });
    }
    const maximo = estudiante.huecos.tipo === "ninguno" ? "sin huecos" : `máximo ${limite} min`;
    salida.push({
      nivel: 4,
      criterio: NOMBRE_DE_NIVEL[4],
      detalle: `${textos.join("; ")} (${maximo})`,
      responsables,
    });
  }

  // Nivel 5: franja.
  if (!cumpleNivel5(seleccion, instancia)) {
    const { inicio, fin } = franjaEfectiva(estudiante);
    salida.push(
      porSesion(
        5,
        seleccion,
        instancia,
        (s) => !sesionEstaDentroDe(s, inicio, fin),
        ` (franja ${formatearHora(inicio)} a ${formatearHora(fin)})`,
      ),
    );
  }

  // Nivel 6: días libres.
  if (!cumpleNivel6(seleccion, instancia)) {
    salida.push(porSesion(6, seleccion, instancia, (s) => estudiante.diasLibres.includes(s.dia)));
  }

  // Nivel 7: profesor.
  if (!cumpleNivel7(seleccion, instancia)) {
    const malos = seleccion.filter((g) => !grupoCumpleProfesor(g, instancia));
    salida.push({
      nivel: 7,
      criterio: NOMBRE_DE_NIVEL[7],
      detalle: malos
        .map(
          (g) =>
            `${nombreDe(g.materiaId, instancia)} con ${instancia.profesores.get(g.profesorId)?.nombre ?? g.profesorId}, que no está en tu lista`,
        )
        .join("; "),
      responsables: malos.map((g) => ({ materiaId: g.materiaId, grupoId: g.id, sesion: null })),
    });
  }

  // Nivel 8: amigos.
  if (!cumpleNivel8(seleccion, instancia)) {
    const coincidencias = contarCoincidenciasAmigos(seleccion, instancia);
    salida.push({
      nivel: 8,
      criterio: NOMBRE_DE_NIVEL[8],
      detalle: `${coincidencias} ${coincidencias === 1 ? "coincidencia" : "coincidencias"} de ${estudiante.minCoincidenciasAmigos} pedidas`,
      responsables: [],
    });
  }
  return salida;
}
