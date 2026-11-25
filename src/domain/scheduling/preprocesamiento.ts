/**
 * Preprocesamiento (entrega 1, sección 2.2.4). Recibe datos ya validados y los
 * deja listos para el algoritmo:
 *
 * - Los días ya vienen normalizados a los seis valores fijos (lo hizo el validador).
 * - Los valores por omisión de la Tabla 2 ya vienen aplicados al `Estudiante`.
 * - Aquí se AGRUPAN los grupos por materia y se separan las materias del perfil
 *   que no tienen ningún grupo en el catálogo.
 */
import type { Catalogo, Estudiante, Grupo, Materia, MateriaSolicitada } from "./modelo.ts";

export type Instancia = {
  catalogo: Catalogo;
  estudiante: Estudiante;
  materias: Map<string, Materia>;
  grupos: Map<string, Grupo>;
  /** Todos los grupos del catálogo por materia (cualquier cupo). */
  gruposDe: Map<string, Grupo[]>;
  /** Materias del perfil que tienen al menos un grupo, en el orden del perfil. */
  solicitadas: MateriaSolicitada[];
  /** Materias del perfil sin ningún grupo en el catálogo (no es un error de validación). */
  sinGrupos: MateriaSolicitada[];
};

export const RAZON_SIN_GRUPOS = "sin grupos en el catálogo";

export function preprocesar(catalogo: Catalogo, estudiante: Estudiante): Instancia {
  const materias = new Map(catalogo.materias.map((m) => [m.id, m]));
  const grupos = new Map(catalogo.grupos.map((g) => [g.id, g]));

  const gruposDe = new Map<string, Grupo[]>();
  for (const grupo of catalogo.grupos) {
    const lista = gruposDe.get(grupo.materiaId);
    if (lista) lista.push(grupo);
    else gruposDe.set(grupo.materiaId, [grupo]);
  }

  const solicitadas: MateriaSolicitada[] = [];
  const sinGrupos: MateriaSolicitada[] = [];
  for (const materia of estudiante.materias) {
    (gruposDe.has(materia.materiaId) ? solicitadas : sinGrupos).push(materia);
  }

  return { catalogo, estudiante, materias, grupos, gruposDe, solicitadas, sinGrupos };
}
