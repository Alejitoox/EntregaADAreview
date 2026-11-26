/**
 * Preprocesamiento (entrega 1, sección 2.2.4). Recibe datos ya validados y los
 * deja listos para el algoritmo:
 *
 * - Los días ya vienen normalizados a los seis valores fijos (lo hizo el validador).
 * - Los valores por omisión de la Tabla 2 ya vienen aplicados al `Estudiante`.
 * - Aquí se AGRUPAN los grupos por materia y se separan las materias del perfil
 *   que no tienen ningún grupo en el catálogo.
 */
import type {
  Catalogo,
  Estudiante,
  Grupo,
  Materia,
  MateriaSolicitada,
  Profesor,
} from "./modelo.ts";

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
  /** Materias del perfil por id (evita buscar en la lista cada vez). */
  solicitadasPorId: Map<string, MateriaSolicitada>;
  /** Profesores del catálogo por id. */
  profesores: Map<string, Profesor>;
  /**
   * Coincidencias con amigos de cada grupo (por id de grupo): cuántos de los
   * amigos del estudiante están inscritos en él. Se calcula una sola vez con
   * conjuntos, en lugar de recorrer las listas de inscritos en cada horario.
   */
  coincidenciasAmigosPorGrupo: Map<string, number>;
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

  const solicitadasPorId = new Map(estudiante.materias.map((m) => [m.materiaId, m]));
  const profesores = new Map(catalogo.profesores.map((p) => [p.id, p]));

  // Un amigo cuenta una vez por cada vez que aparece en la lista de amigos y está inscrito.
  const vecesComoAmigo = new Map<string, number>();
  for (const amigo of estudiante.amigos) {
    vecesComoAmigo.set(amigo, (vecesComoAmigo.get(amigo) ?? 0) + 1);
  }
  const coincidenciasAmigosPorGrupo = new Map<string, number>();
  for (const grupo of catalogo.grupos) {
    let coincidencias = 0;
    if (vecesComoAmigo.size > 0) {
      for (const amigo of new Set(grupo.inscritos)) coincidencias += vecesComoAmigo.get(amigo) ?? 0;
    }
    coincidenciasAmigosPorGrupo.set(grupo.id, coincidencias);
  }

  return {
    catalogo,
    estudiante,
    materias,
    grupos,
    gruposDe,
    solicitadas,
    sinGrupos,
    solicitadasPorId,
    profesores,
    coincidenciasAmigosPorGrupo,
  };
}
