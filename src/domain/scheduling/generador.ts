/**
 * Algoritmo de generación (entrega 1, secciones 2.4 y 2.5).
 *
 * Entrega TODOS los horarios que cumplen los niveles 0 a 8. La búsqueda es un
 * retroceso (backtracking) materia por materia: para cada materia se prueba
 * cada grupo candidato y, si la materia no es de prioridad alta, también
 * omitirla. Se poda cuanto antes con lo que se puede decidir sin ver el
 * horario completo:
 *
 *  - nivel 0: se descarta un grupo que se cruza con los ya elegidos o sin cupos;
 *  - nivel 2: se descarta si los créditos ya pasan el máximo, o si ni tomando
 *    todas las materias que faltan se alcanza el mínimo;
 *  - niveles 3, 5, 6 y 7: son propiedades de un grupo solo, así que los grupos
 *    que no las cumplen ni siquiera se consideran candidatos;
 *  - nivel 1 (maximalidad), 4 (huecos) y 8 (amigos) dependen del horario
 *    completo: se verifican al final con `cumpleNivel`.
 *
 * "Versión del nivel k": `buscarSelecciones(instancia, k)` aplica los criterios
 * 0 a k; la versión final es k = 8.
 */
import {
  criteriosActivos,
  grupoSeTraslapaCon,
  type Criterio,
  type Grupo,
  type Horario,
  type Omitida,
  type Resultado,
} from "./modelo.ts";
import {
  creditosTotales,
  cumpleNivel,
  cumpleNivel3,
  cumpleSoloNivel,
  grupoCabeEnFranja,
  grupoCumpleProfesor,
  grupoRespetaDiasLibres,
  NIVEL_MAXIMO,
  NOMBRE_DE_NIVEL,
  razonesDeOmision,
  sumaPosicionesProfesor,
  type Seleccion,
} from "./niveles.ts";
import { preprocesar, RAZON_SIN_GRUPOS, type Instancia } from "./preprocesamiento.ts";
import { ErrorDeValidacion, parsearJson, validarEntrada } from "./validacion.ts";

/**
 * Sin tope: el enunciado pide TODOS los horarios válidos. Un tope solo se usa si
 * quien llama lo pide expresamente (por ejemplo, para una vista previa).
 */
export const SIN_LIMITE = Number.POSITIVE_INFINITY;

export type BusquedaNivel = { selecciones: Grupo[][]; truncado: boolean };

/* ------------------------------------------------------------------ */
/* Búsqueda de un nivel                                               */
/* ------------------------------------------------------------------ */

/** Grupos de una materia que pueden aparecer en un horario del nivel dado. */
function candidatosDe(materiaId: string, nivel: number, instancia: Instancia): Grupo[] {
  return (instancia.gruposDe.get(materiaId) ?? []).filter((g) => {
    if (g.cuposDisponibles <= 0) return false; // nivel 0
    if (nivel >= 3 && !cumpleNivel3([g])) return false;
    if (nivel >= 5 && !grupoCabeEnFranja(g, instancia)) return false;
    if (nivel >= 6 && !grupoRespetaDiasLibres(g, instancia)) return false;
    if (nivel >= 7 && !grupoCumpleProfesor(g, instancia)) return false;
    return true;
  });
}

/**
 * Todos los horarios (como listas de grupos) que cumplen los niveles 0 a
 * `nivel`. Nunca incluye el horario vacío. Si hay más de `limite`, se detiene y
 * `truncado` es verdadero. Por defecto no hay límite.
 */
export function buscarSelecciones(
  instancia: Instancia,
  nivel: number,
  limite: number = SIN_LIMITE,
): BusquedaNivel {
  if (!Number.isInteger(nivel) || nivel < 0 || nivel > NIVEL_MAXIMO) {
    throw new RangeError("El nivel debe ser un entero entre 0 y 8");
  }
  if (!(limite >= 1)) throw new RangeError("El límite debe ser al menos 1");

  const { estudiante } = instancia;
  const exigeAltas = nivel >= 1;

  // A partir del nivel 1, una materia alta que no se puede incluir no deja ningún horario.
  if (exigeAltas && instancia.sinGrupos.some((m) => m.prioridad === "alta")) {
    return { selecciones: [], truncado: false };
  }

  const materias = instancia.solicitadas
    .map((solicitada) => ({
      solicitada,
      candidatos: candidatosDe(solicitada.materiaId, nivel, instancia),
      creditos: instancia.materias.get(solicitada.materiaId)?.creditos ?? 0,
    }))
    .map((m) => ({ ...m, obligatoria: exigeAltas && m.solicitada.prioridad === "alta" }));

  if (materias.some((m) => m.obligatoria && m.candidatos.length === 0)) {
    return { selecciones: [], truncado: false };
  }

  // Primero las que más restringen: obligatorias y con menos candidatos.
  materias.sort(
    (a, b) =>
      Number(b.obligatoria) - Number(a.obligatoria) ||
      a.candidatos.length - b.candidatos.length ||
      a.solicitada.materiaId.localeCompare(b.solicitada.materiaId),
  );

  // creditosRestantes[i] = créditos de las materias i..fin (cota para el mínimo).
  const creditosRestantes = new Array<number>(materias.length + 1).fill(0);
  for (let i = materias.length - 1; i >= 0; i -= 1) {
    creditosRestantes[i] = creditosRestantes[i + 1] + materias[i].creditos;
  }

  const encontradas: Grupo[][] = [];
  let truncado = false;
  const elegidos: Grupo[] = [];

  function buscar(indice: number, creditos: number): void {
    if (truncado) return;

    if (indice === materias.length) {
      if (elegidos.length === 0) return; // el horario vacío no es un horario
      if (!cumpleNivel(nivel, elegidos, instancia)) return;
      if (encontradas.length === limite) {
        truncado = true;
        return;
      }
      encontradas.push([...elegidos]);
      return;
    }

    // Poda de créditos mínimos (nivel 2): ni tomando todo lo que falta se llega.
    if (nivel >= 2 && creditos + creditosRestantes[indice] < estudiante.creditosMin) return;

    const { candidatos, creditos: creditosMateria, obligatoria } = materias[indice];
    for (const grupo of candidatos) {
      // Nivel 0: sin cruces con lo ya elegido.
      if (elegidos.some((otro) => grupoSeTraslapaCon(grupo, otro))) continue;
      // Nivel 2: no pasar el máximo de créditos.
      if (
        nivel >= 2 &&
        estudiante.creditosMax !== null &&
        creditos + creditosMateria > estudiante.creditosMax
      ) {
        continue;
      }
      elegidos.push(grupo);
      buscar(indice + 1, creditos + creditosMateria);
      elegidos.pop();
      if (truncado) return;
    }

    // Omitir la materia (solo si no es obligatoria).
    if (!obligatoria) buscar(indice + 1, creditos);
  }

  buscar(0, 0);
  return { selecciones: encontradas, truncado };
}

/* ------------------------------------------------------------------ */
/* Orden y construcción de horarios                                   */
/* ------------------------------------------------------------------ */

/** Llave estable para desempatar: los grupos elegidos ordenados por materia. */
function llaveCanonica(seleccion: Seleccion): string {
  return [...seleccion]
    .sort((a, b) => (a.materiaId < b.materiaId ? -1 : a.materiaId > b.materiaId ? 1 : 0))
    .map((g) => `${g.materiaId}:${g.id}`)
    .join("|");
}

/**
 * Ordena por suma de posiciones de los profesores (de menor a mayor). Si hay
 * empate se usa la llave canónica, así el orden es siempre el mismo. Después
 * del orden se numeran los horarios 1, 2, 3…
 */
export function ordenarSelecciones(selecciones: Grupo[][], instancia: Instancia): Grupo[][] {
  return selecciones
    .map((seleccion) => ({
      seleccion,
      suma: sumaPosicionesProfesor(seleccion, instancia),
      llave: llaveCanonica(seleccion),
    }))
    .sort((a, b) => a.suma - b.suma || (a.llave < b.llave ? -1 : a.llave > b.llave ? 1 : 0))
    .map((item) => item.seleccion);
}

/** Convierte una selección en el TAD Horario, con sus materias omitidas y razones. */
export function construirHorario(id: number, seleccion: Seleccion, instancia: Instancia): Horario {
  const incluidas = new Set(seleccion.map((g) => g.materiaId));

  const asignaciones = instancia.estudiante.materias
    .filter((m) => incluidas.has(m.materiaId))
    .map((m) => ({
      materiaId: m.materiaId,
      grupoId: seleccion.find((g) => g.materiaId === m.materiaId)!.id,
    }));

  const omitidas: Omitida[] = instancia.estudiante.materias
    .filter((m) => !incluidas.has(m.materiaId))
    .map((m) => ({
      materiaId: m.materiaId,
      razones: instancia.gruposDe.has(m.materiaId)
        ? razonesDeOmision(m.materiaId, seleccion, instancia)
        : [RAZON_SIN_GRUPOS],
    }));

  return { id, asignaciones, omitidas, creditosTotales: creditosTotales(seleccion, instancia) };
}

function construirHorarios(selecciones: Grupo[][], instancia: Instancia): Horario[] {
  return ordenarSelecciones(selecciones, instancia).map((seleccion, i) =>
    construirHorario(i + 1, seleccion, instancia),
  );
}

/* ------------------------------------------------------------------ */
/* Resultado                                                          */
/* ------------------------------------------------------------------ */

/**
 * ¿Qué materia alta no cabe? Recorre las altas en el orden del perfil y busca la
 * primera que ya no se puede incluir junto con las anteriores (sin cruces, con
 * cupos y dentro del máximo de créditos). Devuelve null si todas caben juntas.
 */
export function altaQueNoCabe(instancia: Instancia): string | null {
  const altas = instancia.solicitadas.filter((m) => m.prioridad === "alta");
  const maximo = instancia.estudiante.creditosMax;

  for (let k = 0; k < altas.length; k += 1) {
    const grupo = altas.slice(0, k + 1);
    const elegidos: Grupo[] = [];

    const cabe = (i: number, creditos: number): boolean => {
      if (i === grupo.length) return true;
      const extra = instancia.materias.get(grupo[i].materiaId)?.creditos ?? 0;
      if (maximo !== null && creditos + extra > maximo) return false;
      for (const g of instancia.gruposDe.get(grupo[i].materiaId) ?? []) {
        if (g.cuposDisponibles <= 0) continue;
        if (elegidos.some((otro) => grupoSeTraslapaCon(g, otro))) continue;
        elegidos.push(g);
        if (cabe(i + 1, creditos + extra)) return true;
        elegidos.pop();
      }
      return false;
    };

    if (!cabe(0, 0)) return altas[k].materiaId;
  }
  return null;
}

function nombreMateria(instancia: Instancia, materiaId: string): string {
  const materia = instancia.materias.get(materiaId);
  return materia ? `${materia.nombre} (${materiaId})` : materiaId;
}

/**
 * Diagnóstico de los criterios que impiden llegar al nivel 8.
 *
 * `nivelAlcanzado` es k: existen horarios que cumplen los niveles 0 a k y
 * ninguno cumple 0 a k+1. Entonces:
 *  - el nivel k+1 es el que bloquea (siempre se informa);
 *  - de los niveles posteriores solo se informan los que NINGUNO de los horarios
 *    del nivel k cumple por sí mismo (están comprobadamente incumplidos). Los que
 *    algún horario sí cumple no se informan: no son la causa, solo no se pudieron
 *    exigir junto con el que bloqueó.
 *  - los criterios que el estudiante no declaró (niveles 3 a 8) no cuentan.
 *
 * Si ni el nivel 0 se alcanza (k = -1), solo se informa `restriccionesDuras`. Si la
 * lista de horarios del nivel quedó incompleta por un límite pedido, tampoco se puede
 * afirmar que "ninguno" cumple un criterio, así que solo se informa el que bloquea.
 */
function criteriosNoCumplidos(
  nivelAlcanzado: number,
  horariosDelNivel: Grupo[][],
  listaCompleta: boolean,
  activos: Criterio[],
  instancia: Instancia,
): string[] {
  const aplica = (nivel: number) =>
    nivel <= 2 || activos.includes(NOMBRE_DE_NIVEL[nivel] as Criterio);

  const bloqueo = nivelAlcanzado + 1;
  if (bloqueo > NIVEL_MAXIMO) return [];
  const faltantes: string[] = [NOMBRE_DE_NIVEL[bloqueo]];
  if (horariosDelNivel.length === 0 || !listaCompleta) return faltantes;

  for (let nivel = bloqueo + 1; nivel <= NIVEL_MAXIMO; nivel += 1) {
    if (!aplica(nivel)) continue;
    const algunoLoCumple = horariosDelNivel.some((seleccion) =>
      cumpleSoloNivel(nivel, seleccion, instancia),
    );
    if (!algunoLoCumple) faltantes.push(NOMBRE_DE_NIVEL[nivel]);
  }
  return faltantes;
}

/**
 * Corre el algoritmo sobre una instancia ya validada y preprocesada.
 *
 *  - OK: existe al menos un horario que cumple los niveles 0 a 8.
 *  - SIN_HORARIO: la instancia es válida pero ningún horario cumple todos los
 *    criterios. Además se informa el nivel más alto alcanzado y los criterios
 *    que faltan; los horarios de ese nivel van en `horariosNivelAlcanzado`.
 */
export function generarHorarios(
  instancia: Instancia,
  limite: number = SIN_LIMITE,
): Resultado {
  const activos = criteriosActivos(instancia.estudiante);
  const base = {
    estudianteId: instancia.estudiante.id,
    criteriosActivos: activos,
    errores: [],
  };

  // Caso habitual: se intenta directamente la versión final (nivel 8).
  const completo = buscarSelecciones(instancia, NIVEL_MAXIMO, limite);
  if (completo.selecciones.length > 0) {
    return {
      ...base,
      estado: "OK",
      motivo: null,
      horarios: construirHorarios(completo.selecciones, instancia),
      nivelAlcanzado: NIVEL_MAXIMO,
      criteriosNoCumplidos: [],
      horariosNivelAlcanzado: [],
      truncado: completo.truncado,
    };
  }

  // Sin solución completa: se busca el nivel más alto que aún tiene horarios.
  // Los niveles son acumulativos (cada conjunto está dentro del anterior), así que
  // "el nivel k tiene horarios" es verdadero hasta cierto punto y falso después:
  // una búsqueda binaria encuentra ese punto con unas 3 búsquedas en vez de hasta 8.
  let nivelAlcanzado = -1;
  let mejor: BusquedaNivel = { selecciones: [], truncado: false };
  let bajo = 0;
  let alto = NIVEL_MAXIMO - 1; // el nivel 8 ya se probó
  while (bajo <= alto) {
    const medio = Math.floor((bajo + alto) / 2);
    const intento = buscarSelecciones(instancia, medio, limite);
    if (intento.selecciones.length > 0) {
      nivelAlcanzado = medio;
      mejor = intento;
      bajo = medio + 1;
    } else {
      alto = medio - 1;
    }
  }

  let motivo = "Ningún horario cumple todos los criterios.";
  const altaSinGrupos = instancia.sinGrupos.find((m) => m.prioridad === "alta");
  if (altaSinGrupos) {
    motivo = `La materia alta ${nombreMateria(instancia, altaSinGrupos.materiaId)} no tiene grupos en el catálogo.`;
  } else if (nivelAlcanzado < 1) {
    const culpable = altaQueNoCabe(instancia);
    if (culpable) {
      motivo = `La materia alta ${nombreMateria(instancia, culpable)} no cabe en el horario: se cruza con otras materias altas, no tiene cupos o supera el máximo de créditos.`;
    }
  }

  return {
    ...base,
    estado: "SIN_HORARIO",
    motivo,
    horarios: [],
    nivelAlcanzado,
    criteriosNoCumplidos: criteriosNoCumplidos(
      nivelAlcanzado,
      mejor.selecciones,
      !mejor.truncado,
      activos,
      instancia,
    ),
    horariosNivelAlcanzado: construirHorarios(mejor.selecciones, instancia),
    truncado: mejor.truncado,
  };
}

/** Resultado del archivo inválido: solo la lista de errores y ningún horario. */
export function resultadoInvalido(errores: ErrorDeValidacion["errores"]): Resultado {
  return {
    estudianteId: null,
    estado: "ARCHIVO_INVALIDO",
    criteriosActivos: [],
    motivo: null,
    horarios: [],
    errores,
    nivelAlcanzado: null,
    criteriosNoCumplidos: [],
    horariosNivelAlcanzado: [],
    truncado: false,
  };
}

export type Ejecucion = { resultado: Resultado; instancia: Instancia | null };

/**
 * Punto de entrada completo: valida, preprocesa y genera. Acepta el texto del
 * archivo o el valor JSON ya parseado. Nunca lanza por datos inválidos: devuelve
 * un resultado ARCHIVO_INVALIDO con todos los errores.
 */
export function ejecutar(
  entrada: string | unknown,
  limite: number = SIN_LIMITE,
): Ejecucion {
  let valor: unknown;
  try {
    valor = typeof entrada === "string" ? parsearJson(entrada) : entrada;
  } catch (error) {
    if (error instanceof ErrorDeValidacion) {
      return { resultado: resultadoInvalido(error.errores), instancia: null };
    }
    throw error;
  }

  const { errores, datos } = validarEntrada(valor);
  if (!datos) return { resultado: resultadoInvalido(errores), instancia: null };

  const instancia = preprocesar(datos.catalogo, datos.estudiante);
  return { resultado: generarHorarios(instancia, limite), instancia };
}
