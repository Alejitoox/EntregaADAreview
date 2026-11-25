/**
 * Generador de datos sintéticos (estrategia de datos de la entrega 1).
 *
 * Produce archivos de entrada con la forma exacta del contrato (bloques
 * `catalogo` y `estudiante`) a partir de una semilla. Con la misma semilla
 * siempre sale el mismo archivo, así las pruebas y las demostraciones son
 * reproducibles. Sirve para tres cosas:
 *
 *  1. casos aleatorios válidos, para comparar el algoritmo contra fuerza bruta;
 *  2. casos con forma controlada (por ejemplo el de 7 materias × 4 grupos de la
 *     sección 2.6, donde el tamaño del espacio de búsqueda se puede contar);
 *  3. casos inválidos, uno por cada código de error de la Tabla 3.
 */
import type { CodigoError } from "../src/domain/scheduling/modelo.ts";

export type Entrada = {
  catalogo: {
    materias: { id: string; nombre: string; creditos: number }[];
    profesores: { id: string; nombre: string }[];
    grupos: {
      id: string;
      materiaId: string;
      profesorId: string;
      cuposDisponibles: number;
      inscritos: string[];
      sesiones: { dia: string; inicio: string; fin: string }[];
    }[];
  };
  estudiante: Record<string, unknown> & {
    id: string;
    materias: { materiaId: string; prioridad: string; profesoresPreferidos?: string[] }[];
  };
};

/** Generador pseudoaleatorio determinista (mulberry32). */
export function crearAzar(semilla: number) {
  let estado = semilla >>> 0;
  const siguiente = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    entero: (minimo: number, maximo: number) => minimo + Math.floor(siguiente() * (maximo - minimo + 1)),
    elegir: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)],
    probabilidad: (p: number) => siguiente() < p,
  };
}

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function hhmm(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

export type OpcionesCaso = {
  materias?: number;
  gruposPorMateria?: number;
  profesores?: number;
  /** Cuántos otros estudiantes pueden aparecer inscritos en los grupos. */
  companeros?: number;
  /** Probabilidad de que un grupo no tenga cupos. */
  probSinCupos?: number;
};

/** Caso aleatorio válido. */
export function generarCaso(semilla: number, opciones: OpcionesCaso = {}): Entrada {
  const azar = crearAzar(semilla);
  const nMaterias = opciones.materias ?? azar.entero(3, 5);
  const gruposPorMateria = opciones.gruposPorMateria ?? azar.entero(1, 3);
  const nProfesores = opciones.profesores ?? azar.entero(2, 4);
  const nCompaneros = opciones.companeros ?? 4;
  const probSinCupos = opciones.probSinCupos ?? 0.1;

  const materias = Array.from({ length: nMaterias }, (_, i) => ({
    id: `M${i + 1}`,
    nombre: `Materia ${i + 1}`,
    creditos: azar.entero(2, 4),
  }));
  const profesores = Array.from({ length: nProfesores }, (_, i) => ({
    id: `P${i + 1}`,
    nombre: `Profesor ${i + 1}`,
  }));
  const companeros = Array.from({ length: nCompaneros }, (_, i) => `E${200 + i}`);

  const grupos: Entrada["catalogo"]["grupos"] = [];
  for (const materia of materias) {
    const cantidad = Math.max(1, gruposPorMateria + azar.entero(-1, 0));
    for (let g = 1; g <= cantidad; g += 1) {
      const diasGrupo = [...DIAS].sort(() => azar.siguiente() - 0.5).slice(0, azar.entero(1, 2));
      grupos.push({
        id: `${materia.id}-${String(g).padStart(2, "0")}`,
        materiaId: materia.id,
        profesorId: azar.elegir(profesores).id,
        cuposDisponibles: azar.probabilidad(probSinCupos) ? 0 : azar.entero(1, 30),
        inscritos: companeros.filter(() => azar.probabilidad(0.2)),
        sesiones: diasGrupo.map((dia) => {
          const inicio = 7 * 60 + 30 * azar.entero(0, 22); // 07:00 a 18:00
          const duracion = azar.elegir([60, 90, 120]);
          return { dia, inicio: hhmm(inicio), fin: hhmm(inicio + duracion) };
        }),
      });
    }
  }

  const solicitadas = materias.map((materia) => {
    const gruposDeMateria = grupos.filter((g) => g.materiaId === materia.id);
    const prioridad = azar.elegir(["alta", "alta", "media", "media", "media", "baja", "baja"]);
    const item: Entrada["estudiante"]["materias"][number] = { materiaId: materia.id, prioridad };
    if (azar.probabilidad(0.4)) {
      const candidatos = [...new Set(gruposDeMateria.map((g) => g.profesorId))];
      item.profesoresPreferidos = candidatos.sort(() => azar.siguiente() - 0.5).slice(0, azar.entero(1, 2));
    }
    return item;
  });

  const estudiante: Entrada["estudiante"] = {
    id: "E101",
    semestre: azar.entero(1, 10),
    materias: solicitadas,
  };
  if (azar.probabilidad(0.6)) {
    const maximo = azar.entero(6, 14);
    estudiante.creditosMax = maximo;
    if (azar.probabilidad(0.6)) estudiante.creditosMin = azar.entero(2, Math.min(maximo, 8));
  }
  if (azar.probabilidad(0.4)) {
    estudiante.franja = { inicio: hhmm(azar.elegir([7, 8]) * 60), fin: hhmm(azar.elegir([15, 18, 20]) * 60) };
  }
  if (azar.probabilidad(0.5)) {
    const tipo = azar.elegir(["ninguno", "cortos", "cortos", "indiferente"]);
    estudiante.huecos = tipo === "cortos" ? { tipo, maxMinutos: azar.elegir([30, 60, 120]) } : { tipo };
  }
  if (azar.probabilidad(0.3)) estudiante.diasLibres = [azar.elegir(DIAS)];
  if (azar.probabilidad(0.5)) {
    estudiante.amigos = companeros.slice(0, azar.entero(1, 3));
    estudiante.minCoincidenciasAmigos = azar.entero(0, 2);
  }
  return { catalogo: { materias, profesores, grupos }, estudiante };
}

/**
 * Caso de la sección 2.6: `nMaterias` materias con `nGrupos` grupos cada una,
 * todos en franjas distintas (nunca se cruzan) y sin restricciones del
 * estudiante. Así el número de horarios válidos de cada nivel se puede contar a
 * mano: (nGrupos + 1)^nMaterias − 1 si todas se pueden omitir, y nGrupos^nMaterias
 * si todas son de prioridad alta.
 */
export function generarCasoSinCruces(
  nMaterias: number,
  nGrupos: number,
  prioridad: "alta" | "media" | "baja" = "media",
): Entrada {
  const materias = Array.from({ length: nMaterias }, (_, i) => ({
    id: `M${i + 1}`,
    nombre: `Materia ${i + 1}`,
    creditos: 3,
  }));
  const profesores = [{ id: "P1", nombre: "Profesor 1" }];
  const grupos: Entrada["catalogo"]["grupos"] = [];
  let franja = 0;
  for (const materia of materias) {
    for (let g = 1; g <= nGrupos; g += 1) {
      // Cada grupo ocupa su propia casilla (día, hora): 6 días × 5 horas = 30 casillas.
      const dia = DIAS[franja % DIAS.length];
      const inicio = (7 + Math.floor(franja / DIAS.length)) * 60;
      grupos.push({
        id: `${materia.id}-${String(g).padStart(2, "0")}`,
        materiaId: materia.id,
        profesorId: "P1",
        cuposDisponibles: 10,
        inscritos: [],
        sesiones: [{ dia, inicio: hhmm(inicio), fin: hhmm(inicio + 60) }],
      });
      franja += 1;
    }
  }
  return {
    catalogo: { materias, profesores, grupos },
    estudiante: {
      id: "E101",
      semestre: 6,
      materias: materias.map((m) => ({ materiaId: m.id, prioridad })),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Casos inválidos: uno por código de error                           */
/* ------------------------------------------------------------------ */

const clonar = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

/** Base pequeña y válida sobre la que se aplican las mutaciones. */
export function casoBaseValido(): Entrada {
  return {
    catalogo: {
      materias: [
        { id: "ED101", nombre: "Ecuaciones Diferenciales", creditos: 3 },
        { id: "FI202", nombre: "Física II", creditos: 4 },
      ],
      profesores: [
        { id: "P12", nombre: "Profesor Ejemplo" },
        { id: "P08", nombre: "Otra Profesora" },
      ],
      grupos: [
        {
          id: "ED101-01",
          materiaId: "ED101",
          profesorId: "P12",
          cuposDisponibles: 5,
          inscritos: ["E203", "E417"],
          sesiones: [{ dia: "lunes", inicio: "07:00", fin: "09:00" }],
        },
        {
          id: "FI202-01",
          materiaId: "FI202",
          profesorId: "P08",
          cuposDisponibles: 8,
          inscritos: [],
          sesiones: [
            { dia: "martes", inicio: "09:00", fin: "11:00" },
            { dia: "jueves", inicio: "09:00", fin: "11:00" },
          ],
        },
      ],
    },
    estudiante: {
      id: "E101",
      semestre: 6,
      creditosMin: 3,
      creditosMax: 8,
      materias: [
        { materiaId: "ED101", prioridad: "alta", profesoresPreferidos: ["P12", "P08"] },
        { materiaId: "FI202", prioridad: "media", profesoresPreferidos: [] },
      ],
      franja: { inicio: "07:00", fin: "13:00" },
      huecos: { tipo: "cortos", maxMinutos: 60 },
      diasLibres: ["viernes"],
      amigos: ["E203", "E417"],
      minCoincidenciasAmigos: 1,
    },
  };
}

export type CasoInvalido = {
  descripcion: string;
  codigoEsperado: CodigoError;
  /** Ruta del campo que debe quedar señalada en el error. */
  rutaEsperada: string;
  /** Contenido del archivo (texto) para poder probar también JSON mal formado. */
  texto: string;
};

/** Un caso inválido por cada código de la Tabla 3. */
export function casosInvalidos(): CasoInvalido[] {
  const variante = (mutar: (caso: Entrada) => void): string => {
    const caso = clonar(casoBaseValido());
    mutar(caso);
    return JSON.stringify(caso, null, 2);
  };

  return [
    {
      descripcion: "El archivo tiene una coma de más y no es JSON válido",
      codigoEsperado: "JSON_MAL_FORMADO",
      rutaEsperada: "$",
      texto: '{\n  "catalogo": {},\n  "estudiante": { "id": "E101", },\n}',
    },
    {
      descripcion: "Falta el bloque estudiante completo",
      codigoEsperado: "ESTRUCTURA_INVALIDA",
      rutaEsperada: "estudiante",
      texto: variante((c) => {
        delete (c as Partial<Entrada>).estudiante;
      }),
    },
    {
      descripcion: "Un grupo no tiene el campo obligatorio profesorId",
      codigoEsperado: "CAMPO_FALTANTE",
      rutaEsperada: "catalogo.grupos[0].profesorId",
      texto: variante((c) => {
        delete (c.catalogo.grupos[0] as Partial<(typeof c.catalogo.grupos)[0]>).profesorId;
      }),
    },
    {
      descripcion: "Los créditos de una materia vienen como texto",
      codigoEsperado: "TIPO_INCORRECTO",
      rutaEsperada: "catalogo.materias[1].creditos",
      texto: variante((c) => {
        (c.catalogo.materias[1] as { creditos: unknown }).creditos = "cuatro";
      }),
    },
    {
      descripcion: 'Una sesión es el "domingo"',
      codigoEsperado: "VALOR_NO_PERMITIDO",
      rutaEsperada: "catalogo.grupos[0].sesiones[0].dia",
      texto: variante((c) => {
        c.catalogo.grupos[0].sesiones[0].dia = "domingo";
      }),
    },
    {
      descripcion: "creditosMin es mayor que creditosMax",
      codigoEsperado: "RANGO_INVALIDO",
      rutaEsperada: "estudiante.creditosMin",
      texto: variante((c) => {
        c.estudiante.creditosMin = 12;
        c.estudiante.creditosMax = 6;
      }),
    },
    {
      descripcion: "El estudiante pide una materia que no existe en el catálogo",
      codigoEsperado: "REFERENCIA_INEXISTENTE",
      rutaEsperada: "estudiante.materias[1].materiaId",
      texto: variante((c) => {
        c.estudiante.materias[1].materiaId = "XX999";
      }),
    },
    {
      descripcion: "Dos materias del catálogo tienen el mismo id",
      codigoEsperado: "DUPLICADO",
      rutaEsperada: "catalogo.materias[1].id",
      texto: variante((c) => {
        c.catalogo.materias[1].id = "ED101";
      }),
    },
    {
      descripcion: "Huecos de tipo cortos sin maxMinutos",
      codigoEsperado: "DEPENDENCIA_FALTANTE",
      rutaEsperada: "estudiante.huecos.maxMinutos",
      texto: variante((c) => {
        c.estudiante.huecos = { tipo: "cortos" };
      }),
    },
  ];
}

/** Archivo con varios errores a la vez (para probar que se reportan todos juntos). */
export function casoConVariosErrores(): string {
  const caso = clonar(casoBaseValido());
  caso.catalogo.grupos[0].sesiones[0].dia = "domingo";
  (caso.catalogo.materias[1] as { creditos: unknown }).creditos = "cuatro";
  caso.catalogo.grupos[1].profesorId = "P99";
  caso.estudiante.materias[0].prioridad = "urgente";
  delete (caso.estudiante as Partial<typeof caso.estudiante>).semestre;
  return JSON.stringify(caso, null, 2);
}
