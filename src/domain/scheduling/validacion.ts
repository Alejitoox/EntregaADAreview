/**
 * Validación del archivo de entrada (entrega 1, secciones 2.2.2 y 2.2.5).
 *
 * El validador recorre TODO el archivo acumulando errores: nunca se detiene en
 * el primero. Cada error lleva su código (Tabla 3), la ruta exacta del campo,
 * lo que se esperaba y lo que se encontró. Si la lista no queda vacía, quien
 * llama debe lanzar `ErrorDeValidacion` y no ejecutar el algoritmo.
 */
import {
  DIAS,
  MINUTOS_DEL_DIA,
  type Catalogo,
  type CodigoError,
  type Dia,
  type ErrorValidacion,
  type Estudiante,
  type Grupo,
  type Materia,
  type MateriaSolicitada,
  type Prioridad,
  type Profesor,
  type Sesion,
  type TipoHuecos,
} from "./modelo.ts";

type Objeto = Record<string, unknown>;

/** Excepción propia de validación: transporta la lista completa de errores. */
export class ErrorDeValidacion extends Error {
  errores: ErrorValidacion[];

  constructor(errores: ErrorValidacion[]) {
    super(`Archivo inválido: ${errores.length} error(es) de validación`);
    this.name = "ErrorDeValidacion";
    this.errores = errores;
  }
}

export type DatosValidados = { catalogo: Catalogo; estudiante: Estudiante };

const DIAS_PERMITIDOS = "lunes, martes, miércoles, jueves, viernes o sábado";
const PRIORIDADES: readonly Prioridad[] = ["alta", "media", "baja"];
const TIPOS_HUECOS: readonly TipoHuecos[] = ["ninguno", "cortos", "indiferente"];

/* ------------------------------------------------------------------ */
/* API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Convierte el texto del archivo en un valor JSON. Si no es JSON válido lanza
 * `ErrorDeValidacion` con un único error JSON_MAL_FORMADO que indica la línea
 * y la columna del fallo.
 */
export function parsearJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch (causa) {
    const mensaje = causa instanceof Error ? causa.message : String(causa);
    const { linea, columna } = ubicarFallo(texto, mensaje);
    throw new ErrorDeValidacion([
      {
        codigo: "JSON_MAL_FORMADO",
        ruta: "$",
        mensaje: `El archivo no es un JSON válido (línea ${linea}, columna ${columna}).`,
        esperado: "un documento JSON bien formado",
        encontrado: `error de sintaxis en la línea ${linea}, columna ${columna}`,
      },
    ]);
  }
}

/**
 * Valida el contenido ya parseado. Devuelve todos los errores encontrados; si
 * no hay ninguno, devuelve además los datos tipados y normalizados (días en
 * minúscula con tilde, valores neutros de la Tabla 2 ya aplicados).
 */
export function validarEntrada(entrada: unknown): {
  errores: ErrorValidacion[];
  datos: DatosValidados | null;
} {
  const acc = new Acumulador();

  if (!esObjeto(entrada)) {
    acc.agregar(
      "ESTRUCTURA_INVALIDA",
      "$",
      "un objeto con los bloques catalogo y estudiante",
      describir(entrada),
    );
    return { errores: acc.errores, datos: null };
  }

  const bloqueCatalogo = leerBloque(entrada, "catalogo", acc);
  const bloqueEstudiante = leerBloque(entrada, "estudiante", acc);

  const catalogo = bloqueCatalogo ? validarCatalogo(bloqueCatalogo, acc) : null;
  // Si falta el catálogo igual se revisa el perfil, pero sin comprobar referencias.
  const estudiante = bloqueEstudiante ? validarEstudiante(bloqueEstudiante, catalogo, acc) : null;

  if (acc.errores.length > 0 || !catalogo || !estudiante) {
    return { errores: acc.errores, datos: null };
  }
  return { errores: [], datos: { catalogo: catalogo.valor, estudiante } };
}

/** Parsea y valida un texto. Lanza `ErrorDeValidacion` si hay cualquier error. */
export function validarTexto(texto: string): DatosValidados {
  const resultado = validarEntrada(parsearJson(texto));
  if (!resultado.datos) throw new ErrorDeValidacion(resultado.errores);
  return resultado.datos;
}

/** Valida un valor ya parseado. Lanza `ErrorDeValidacion` si hay cualquier error. */
export function validarOLanzar(entrada: unknown): DatosValidados {
  const resultado = validarEntrada(entrada);
  if (!resultado.datos) throw new ErrorDeValidacion(resultado.errores);
  return resultado.datos;
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                           */
/* ------------------------------------------------------------------ */

type CatalogoLeido = {
  valor: Catalogo;
  idsMaterias: Set<string>;
  idsProfesores: Set<string>;
  /** False si la lista no se pudo leer: entonces no se comprueban referencias a ella. */
  materiasLeidas: boolean;
  profesoresLeidos: boolean;
};

function existeMateria(catalogo: CatalogoLeido | null, id: string): boolean {
  return !catalogo || !catalogo.materiasLeidas || catalogo.idsMaterias.has(id);
}

function existeProfesor(catalogo: CatalogoLeido | null, id: string): boolean {
  return !catalogo || !catalogo.profesoresLeidos || catalogo.idsProfesores.has(id);
}

function validarCatalogo(bloque: Objeto, acc: Acumulador): CatalogoLeido | null {
  const materias: Materia[] = [];
  const profesores: Profesor[] = [];
  const grupos: Grupo[] = [];
  const idsMaterias = new Set<string>();
  const idsProfesores = new Set<string>();

  const listaMaterias = leerLista(bloque, "materias", "catalogo", acc);
  const listaProfesores = leerLista(bloque, "profesores", "catalogo", acc);
  const listaGrupos = leerLista(bloque, "grupos", "catalogo", acc);

  /* Materias */
  const primeraMateria = new Map<string, number>();
  listaMaterias?.forEach((item, i) => {
    const ruta = `catalogo.materias[${i}]`;
    if (!esObjeto(item)) return void acc.agregar("TIPO_INCORRECTO", ruta, "objeto", describir(item));

    const id = leerTexto(item, "id", ruta, acc);
    const nombre = leerTexto(item, "nombre", ruta, acc);
    const creditos = leerEntero(item, "creditos", ruta, acc, 1, "entero mayor que 0");
    if (id !== undefined) {
      registrarId(id, `${ruta}.id`, `materias[${i}]`, primeraMateria, i, acc);
      idsMaterias.add(id);
    }
    if (id !== undefined && nombre !== undefined && creditos !== undefined) {
      materias.push({ id, nombre, creditos });
    }
  });

  /* Profesores */
  const primerProfesor = new Map<string, number>();
  listaProfesores?.forEach((item, i) => {
    const ruta = `catalogo.profesores[${i}]`;
    if (!esObjeto(item)) return void acc.agregar("TIPO_INCORRECTO", ruta, "objeto", describir(item));

    const id = leerTexto(item, "id", ruta, acc);
    const nombre = leerTexto(item, "nombre", ruta, acc);
    if (id !== undefined) {
      registrarId(id, `${ruta}.id`, `profesores[${i}]`, primerProfesor, i, acc);
      idsProfesores.add(id);
    }
    if (id !== undefined && nombre !== undefined) profesores.push({ id, nombre });
  });

  /* Grupos */
  const primerGrupo = new Map<string, number>();
  listaGrupos?.forEach((item, i) => {
    const ruta = `catalogo.grupos[${i}]`;
    if (!esObjeto(item)) return void acc.agregar("TIPO_INCORRECTO", ruta, "objeto", describir(item));

    const id = leerTexto(item, "id", ruta, acc);
    const materiaId = leerTexto(item, "materiaId", ruta, acc);
    const profesorId = leerTexto(item, "profesorId", ruta, acc);
    const cupos = leerEntero(item, "cuposDisponibles", ruta, acc, 0, "entero mayor o igual a 0");
    const inscritos = leerIdsSinDuplicados(item, "inscritos", ruta, acc, false) ?? [];
    const sesiones = validarSesiones(item, ruta, acc);

    if (id !== undefined) registrarId(id, `${ruta}.id`, `grupos[${i}]`, primerGrupo, i, acc);
    if (materiaId !== undefined && listaMaterias !== undefined && !idsMaterias.has(materiaId)) {
      acc.agregar(
        "REFERENCIA_INEXISTENTE",
        `${ruta}.materiaId`,
        "id de una materia que exista en catalogo.materias",
        describir(materiaId),
      );
    }
    if (profesorId !== undefined && listaProfesores !== undefined && !idsProfesores.has(profesorId)) {
      acc.agregar(
        "REFERENCIA_INEXISTENTE",
        `${ruta}.profesorId`,
        "id de un profesor que exista en catalogo.profesores",
        describir(profesorId),
      );
    }

    if (
      id !== undefined &&
      materiaId !== undefined &&
      profesorId !== undefined &&
      cupos !== undefined &&
      sesiones !== undefined
    ) {
      grupos.push({
        id,
        materiaId,
        profesorId,
        cuposDisponibles: cupos,
        inscritos,
        sesiones,
      });
    }
  });

  return {
    valor: { materias, profesores, grupos },
    idsMaterias,
    idsProfesores,
    materiasLeidas: listaMaterias !== undefined,
    profesoresLeidos: listaProfesores !== undefined,
  };
}

function validarSesiones(grupo: Objeto, rutaGrupo: string, acc: Acumulador): Sesion[] | undefined {
  const lista = leerLista(grupo, "sesiones", rutaGrupo, acc);
  if (!lista) return undefined;
  const rutaLista = `${rutaGrupo}.sesiones`;

  if (lista.length === 0) {
    acc.agregar("RANGO_INVALIDO", rutaLista, "al menos una sesión", "lista vacía");
    return undefined;
  }

  const sesiones: Sesion[] = [];
  let completas = true;
  lista.forEach((item, j) => {
    const ruta = `${rutaLista}[${j}]`;
    if (!esObjeto(item)) {
      completas = false;
      return void acc.agregar("TIPO_INCORRECTO", ruta, "objeto", describir(item));
    }
    const dia = leerDia(item, "dia", ruta, acc, true);
    const inicio = leerHora(item, "inicio", ruta, acc);
    const fin = leerHora(item, "fin", ruta, acc);
    if (inicio !== undefined && fin !== undefined && inicio >= fin) {
      acc.agregar(
        "RANGO_INVALIDO",
        `${ruta}.inicio`,
        "una hora de inicio menor que la de fin",
        `inicio ${formatearHora(inicio)} y fin ${formatearHora(fin)}`,
      );
      completas = false;
    }
    if (dia === undefined || inicio === undefined || fin === undefined || inicio >= fin) {
      completas = false;
      return;
    }
    sesiones.push({ dia, inicio, fin });
  });

  if (!completas) return undefined;

  /* Las sesiones de un mismo grupo no se traslapan entre sí. */
  for (let a = 0; a < sesiones.length; a += 1) {
    for (let b = a + 1; b < sesiones.length; b += 1) {
      if (
        sesiones[a].dia === sesiones[b].dia &&
        Math.max(sesiones[a].inicio, sesiones[b].inicio) < Math.min(sesiones[a].fin, sesiones[b].fin)
      ) {
        acc.agregar(
          "RANGO_INVALIDO",
          rutaLista,
          "sesiones del mismo grupo sin traslapes",
          `sesiones[${a}] y sesiones[${b}] se traslapan el ${sesiones[a].dia}`,
        );
        return undefined;
      }
    }
  }
  return sesiones;
}

/* ------------------------------------------------------------------ */
/* Estudiante                                                         */
/* ------------------------------------------------------------------ */

function validarEstudiante(
  bloque: Objeto,
  catalogo: CatalogoLeido | null,
  acc: Acumulador,
): Estudiante | null {
  const ruta = "estudiante";

  const id = leerTexto(bloque, "id", ruta, acc);
  const semestre = leerEntero(bloque, "semestre", ruta, acc, 1, "entero mayor o igual a 1");
  const creditosMin = leerEntero(bloque, "creditosMin", ruta, acc, 1, "entero mayor que 0", false);
  const creditosMax = leerEntero(bloque, "creditosMax", ruta, acc, 1, "entero mayor que 0", false);
  if (creditosMin !== undefined && creditosMax !== undefined && creditosMin > creditosMax) {
    acc.agregar(
      "RANGO_INVALIDO",
      `${ruta}.creditosMin`,
      "creditosMin menor o igual a creditosMax",
      `creditosMin ${creditosMin} y creditosMax ${creditosMax}`,
    );
  }

  /* Materias solicitadas */
  const materias: MateriaSolicitada[] = [];
  const lista = leerLista(bloque, "materias", ruta, acc);
  if (lista && lista.length === 0) {
    acc.agregar("RANGO_INVALIDO", `${ruta}.materias`, "al menos una materia", "lista vacía");
  }
  const primeraSolicitada = new Map<string, number>();
  lista?.forEach((item, i) => {
    const rutaItem = `${ruta}.materias[${i}]`;
    if (!esObjeto(item)) {
      return void acc.agregar("TIPO_INCORRECTO", rutaItem, "objeto", describir(item));
    }

    const materiaId = leerTexto(item, "materiaId", rutaItem, acc);
    if (materiaId !== undefined) {
      if (!existeMateria(catalogo, materiaId)) {
        acc.agregar(
          "REFERENCIA_INEXISTENTE",
          `${rutaItem}.materiaId`,
          "id de una materia que exista en el catálogo",
          describir(materiaId),
        );
      }
      const previa = primeraSolicitada.get(materiaId);
      if (previa !== undefined) {
        acc.agregar(
          "DUPLICADO",
          `${rutaItem}.materiaId`,
          "cada materia solo una vez en el perfil",
          `${describir(materiaId)} ya aparece en materias[${previa}]`,
        );
      } else {
        primeraSolicitada.set(materiaId, i);
      }
    }

    const prioridad = leerPrioridad(item, rutaItem, acc);
    const profesoresPreferidos = validarProfesoresPreferidos(item, rutaItem, catalogo, acc);

    if (materiaId !== undefined && prioridad !== undefined && profesoresPreferidos !== undefined) {
      materias.push({ materiaId, prioridad, profesoresPreferidos });
    }
  });

  /* Franja */
  const franja = validarFranja(bloque, ruta, acc);

  /* Huecos */
  const huecos = validarHuecos(bloque, ruta, acc);

  /* Días libres */
  const diasLibres = validarDiasLibres(bloque, ruta, acc);

  /* Amigos */
  const amigos = leerIdsSinDuplicados(bloque, "amigos", ruta, acc, false);
  const minCoincidencias = leerEntero(
    bloque,
    "minCoincidenciasAmigos",
    ruta,
    acc,
    0,
    "entero mayor o igual a 0",
    false,
  );

  if (id === undefined || semestre === undefined) return null;

  return {
    id,
    semestre,
    creditosMin: creditosMin ?? 0,
    creditosMax: creditosMax ?? null,
    materias,
    franja: franja ?? null,
    huecos: huecos ?? { tipo: "indiferente", maxMinutos: 0 },
    diasLibres: diasLibres ?? [],
    amigos: amigos ?? [],
    minCoincidenciasAmigos: minCoincidencias ?? 0,
  };
}

function leerPrioridad(item: Objeto, ruta: string, acc: Acumulador): Prioridad | undefined {
  const valor = item.prioridad;
  const rutaCampo = `${ruta}.prioridad`;
  if (valor === undefined) {
    acc.agregar("CAMPO_FALTANTE", rutaCampo, "alta, media o baja", null);
    return undefined;
  }
  if (typeof valor !== "string") {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "texto: alta, media o baja", describir(valor));
    return undefined;
  }
  if (!PRIORIDADES.includes(valor as Prioridad)) {
    acc.agregar("VALOR_NO_PERMITIDO", rutaCampo, "alta, media o baja", describir(valor));
    return undefined;
  }
  return valor as Prioridad;
}

function validarProfesoresPreferidos(
  item: Objeto,
  ruta: string,
  catalogo: CatalogoLeido | null,
  acc: Acumulador,
): string[] | undefined {
  const rutaCampo = `${ruta}.profesoresPreferidos`;
  const valor = item.profesoresPreferidos;
  if (valor === undefined) return []; // se omite: cualquier profesor sirve
  if (!Array.isArray(valor)) {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "lista de ids de profesores", describir(valor));
    return undefined;
  }

  const ids: string[] = [];
  const primero = new Map<string, number>();
  let correcto = true;
  valor.forEach((profesorId, k) => {
    const rutaId = `${rutaCampo}[${k}]`;
    if (typeof profesorId !== "string" || !profesorId.trim()) {
      correcto = false;
      return void acc.agregar("TIPO_INCORRECTO", rutaId, "texto no vacío", describir(profesorId));
    }
    if (!existeProfesor(catalogo, profesorId)) {
      correcto = false;
      acc.agregar(
        "REFERENCIA_INEXISTENTE",
        rutaId,
        "id de un profesor que exista en el catálogo",
        describir(profesorId),
      );
    }
    const previo = primero.get(profesorId);
    if (previo !== undefined) {
      correcto = false;
      acc.agregar(
        "DUPLICADO",
        rutaId,
        "profesores preferidos sin repetir",
        `${describir(profesorId)} ya aparece en la posición ${previo}`,
      );
    } else {
      primero.set(profesorId, k);
    }
    ids.push(profesorId);
  });
  return correcto ? ids : undefined;
}

function validarFranja(
  bloque: Objeto,
  ruta: string,
  acc: Acumulador,
): { inicio: number; fin: number } | undefined {
  const valor = bloque.franja;
  const rutaCampo = `${ruta}.franja`;
  if (valor === undefined) return undefined;
  if (!esObjeto(valor)) {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "objeto con inicio y fin", describir(valor));
    return undefined;
  }
  const inicio = leerHora(valor, "inicio", rutaCampo, acc);
  const fin = leerHora(valor, "fin", rutaCampo, acc);
  if (inicio === undefined || fin === undefined) return undefined;
  if (inicio >= fin) {
    acc.agregar(
      "RANGO_INVALIDO",
      `${rutaCampo}.inicio`,
      "inicio menor que fin",
      `inicio ${formatearHora(inicio)} y fin ${formatearHora(fin)}`,
    );
    return undefined;
  }
  return { inicio, fin };
}

function validarHuecos(
  bloque: Objeto,
  ruta: string,
  acc: Acumulador,
): { tipo: TipoHuecos; maxMinutos: number } | undefined {
  const valor = bloque.huecos;
  const rutaCampo = `${ruta}.huecos`;
  if (valor === undefined) return undefined;
  if (!esObjeto(valor)) {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "objeto con tipo y maxMinutos", describir(valor));
    return undefined;
  }

  let tipo: TipoHuecos | undefined;
  if (valor.tipo === undefined) {
    tipo = "indiferente";
  } else if (typeof valor.tipo !== "string") {
    acc.agregar("TIPO_INCORRECTO", `${rutaCampo}.tipo`, "texto", describir(valor.tipo));
  } else if (!TIPOS_HUECOS.includes(valor.tipo as TipoHuecos)) {
    acc.agregar(
      "VALOR_NO_PERMITIDO",
      `${rutaCampo}.tipo`,
      "ninguno, cortos o indiferente",
      describir(valor.tipo),
    );
  } else {
    tipo = valor.tipo as TipoHuecos;
  }

  const maxMinutos = leerEntero(
    valor,
    "maxMinutos",
    rutaCampo,
    acc,
    0,
    "entero mayor o igual a 0",
    false,
  );
  if (tipo === "cortos" && maxMinutos === undefined && valor.maxMinutos === undefined) {
    acc.agregar(
      "DEPENDENCIA_FALTANTE",
      `${rutaCampo}.maxMinutos`,
      "maxMinutos es obligatorio cuando el tipo de huecos es cortos",
      null,
    );
  }
  if (tipo === undefined) return undefined;
  return { tipo, maxMinutos: maxMinutos ?? 0 };
}

function validarDiasLibres(bloque: Objeto, ruta: string, acc: Acumulador): Dia[] | undefined {
  const valor = bloque.diasLibres;
  const rutaCampo = `${ruta}.diasLibres`;
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor)) {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "lista de días", describir(valor));
    return undefined;
  }

  const dias: Dia[] = [];
  let correcto = true;
  valor.forEach((item, k) => {
    const rutaDia = `${rutaCampo}[${k}]`;
    const dia = convertirDia(item, rutaDia, acc);
    if (dia === undefined) return void (correcto = false);
    if (dias.includes(dia)) {
      correcto = false;
      return void acc.agregar(
        "DUPLICADO",
        rutaDia,
        "días libres sin repetir",
        `${describir(item)} ya está en la lista`,
      );
    }
    dias.push(dia);
  });
  return correcto ? dias : undefined;
}

/* ------------------------------------------------------------------ */
/* Lectores de campos                                                 */
/* ------------------------------------------------------------------ */

class Acumulador {
  errores: ErrorValidacion[] = [];

  agregar(codigo: CodigoError, ruta: string, esperado: string, encontrado: string | null): void {
    this.errores.push({
      codigo,
      ruta,
      mensaje: construirMensaje(codigo, ruta, esperado, encontrado),
      esperado,
      encontrado,
    });
  }
}

function construirMensaje(
  codigo: CodigoError,
  ruta: string,
  esperado: string,
  encontrado: string | null,
): string {
  switch (codigo) {
    case "ESTRUCTURA_INVALIDA":
      return `Falta el bloque completo ${ruta}.`;
    case "CAMPO_FALTANTE":
      return `Falta el campo obligatorio ${ruta}.`;
    case "TIPO_INCORRECTO":
      return `El campo ${ruta} tiene un tipo distinto del esperado.`;
    case "VALOR_NO_PERMITIDO":
      return `El valor de ${ruta} no está entre los permitidos.`;
    case "RANGO_INVALIDO":
      return `El valor de ${ruta} está fuera del rango válido.`;
    case "REFERENCIA_INEXISTENTE":
      return `${ruta} apunta a un id que no existe en el catálogo.`;
    case "DUPLICADO":
      return `${ruta} repite un identificador.`;
    case "DEPENDENCIA_FALTANTE":
      return `${ruta} es obligatorio por el valor de otro campo.`;
    default:
      return `Problema en ${ruta}: se esperaba ${esperado}, se encontró ${encontrado ?? "nada"}.`;
  }
}

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Texto corto para mostrar un valor encontrado en un error. */
function describir(valor: unknown): string | null {
  if (valor === undefined) return null;
  if (valor === null) return "null";
  if (Array.isArray(valor)) return valor.length === 0 ? "lista vacía" : "una lista";
  if (typeof valor === "object") return "un objeto";
  const texto = JSON.stringify(valor);
  const recortado = texto.length > 60 ? `${texto.slice(0, 57)}…` : texto;
  if (typeof valor === "string") return `${recortado} (texto)`;
  if (typeof valor === "number") return `${recortado} (número)`;
  return `${recortado} (booleano)`;
}

function leerBloque(raiz: Objeto, nombre: string, acc: Acumulador): Objeto | null {
  const valor = raiz[nombre];
  if (valor === undefined) {
    acc.agregar("ESTRUCTURA_INVALIDA", nombre, `el bloque ${nombre}`, null);
    return null;
  }
  if (!esObjeto(valor)) {
    acc.agregar("TIPO_INCORRECTO", nombre, "objeto", describir(valor));
    return null;
  }
  return valor;
}

function leerLista(
  objeto: Objeto,
  campo: string,
  ruta: string,
  acc: Acumulador,
): unknown[] | undefined {
  const valor = objeto[campo];
  const rutaCampo = `${ruta}.${campo}`;
  if (valor === undefined) {
    acc.agregar("CAMPO_FALTANTE", rutaCampo, "una lista", null);
    return undefined;
  }
  if (!Array.isArray(valor)) {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "una lista", describir(valor));
    return undefined;
  }
  return valor;
}

function leerTexto(
  objeto: Objeto,
  campo: string,
  ruta: string,
  acc: Acumulador,
): string | undefined {
  const valor = objeto[campo];
  const rutaCampo = `${ruta}.${campo}`;
  if (valor === undefined) {
    acc.agregar("CAMPO_FALTANTE", rutaCampo, "texto no vacío", null);
    return undefined;
  }
  if (typeof valor !== "string") {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "texto no vacío", describir(valor));
    return undefined;
  }
  if (!valor.trim()) {
    acc.agregar("VALOR_NO_PERMITIDO", rutaCampo, "texto no vacío", describir(valor));
    return undefined;
  }
  return valor;
}

function leerEntero(
  objeto: Objeto,
  campo: string,
  ruta: string,
  acc: Acumulador,
  minimo: number,
  esperado: string,
  obligatorio = true,
): number | undefined {
  const valor = objeto[campo];
  const rutaCampo = `${ruta}.${campo}`;
  if (valor === undefined) {
    if (obligatorio) acc.agregar("CAMPO_FALTANTE", rutaCampo, esperado, null);
    return undefined;
  }
  if (typeof valor !== "number") {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, esperado, describir(valor));
    return undefined;
  }
  if (!Number.isInteger(valor) || valor < minimo) {
    acc.agregar("RANGO_INVALIDO", rutaCampo, esperado, describir(valor));
    return undefined;
  }
  return valor;
}

/** Lista de ids (texto) sin duplicados; puede estar vacía. */
function leerIdsSinDuplicados(
  objeto: Objeto,
  campo: string,
  ruta: string,
  acc: Acumulador,
  obligatorio: boolean,
): string[] | undefined {
  const valor = objeto[campo];
  const rutaCampo = `${ruta}.${campo}`;
  if (valor === undefined) {
    if (obligatorio) acc.agregar("CAMPO_FALTANTE", rutaCampo, "lista de ids", null);
    return undefined;
  }
  if (!Array.isArray(valor)) {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, "lista de ids (texto)", describir(valor));
    return undefined;
  }

  const ids: string[] = [];
  const primero = new Map<string, number>();
  let correcto = true;
  valor.forEach((id, k) => {
    const rutaId = `${rutaCampo}[${k}]`;
    if (typeof id !== "string" || !id.trim()) {
      correcto = false;
      return void acc.agregar("TIPO_INCORRECTO", rutaId, "texto no vacío", describir(id));
    }
    const previo = primero.get(id);
    if (previo !== undefined) {
      correcto = false;
      return void acc.agregar(
        "DUPLICADO",
        rutaId,
        "ids sin repetir",
        `${describir(id)} ya aparece en la posición ${previo}`,
      );
    }
    primero.set(id, k);
    ids.push(id);
  });
  return correcto ? ids : undefined;
}

function registrarId(
  id: string,
  rutaId: string,
  etiqueta: string,
  vistos: Map<string, number>,
  indice: number,
  acc: Acumulador,
): void {
  const previo = vistos.get(id);
  if (previo === undefined) {
    vistos.set(id, indice);
    return;
  }
  acc.agregar(
    "DUPLICADO",
    rutaId,
    "id único dentro de su lista",
    `${describir(id)} ya aparece en ${etiqueta.replace(/\[\d+\]/, `[${previo}]`)}`,
  );
}

/* Días y horas ----------------------------------------------------- */

function quitarTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lleva el texto a uno de los seis días canónicos, o devuelve undefined si no lo es. */
export function normalizarDia(valor: unknown): Dia | undefined {
  if (typeof valor !== "string") return undefined;
  const clave = quitarTildes(valor.trim().toLocaleLowerCase("es"));
  return DIAS.find((dia) => quitarTildes(dia) === clave);
}

function convertirDia(valor: unknown, ruta: string, acc: Acumulador): Dia | undefined {
  if (typeof valor !== "string") {
    acc.agregar("TIPO_INCORRECTO", ruta, `texto: ${DIAS_PERMITIDOS}`, describir(valor));
    return undefined;
  }
  const dia = normalizarDia(valor);
  if (!dia) {
    acc.agregar("VALOR_NO_PERMITIDO", ruta, DIAS_PERMITIDOS, describir(valor));
    return undefined;
  }
  return dia;
}

function leerDia(
  objeto: Objeto,
  campo: string,
  ruta: string,
  acc: Acumulador,
  obligatorio: boolean,
): Dia | undefined {
  const valor = objeto[campo];
  const rutaCampo = `${ruta}.${campo}`;
  if (valor === undefined) {
    if (obligatorio) acc.agregar("CAMPO_FALTANTE", rutaCampo, DIAS_PERMITIDOS, null);
    return undefined;
  }
  return convertirDia(valor, rutaCampo, acc);
}

/** Lee una hora con formato HH:MM y la devuelve en minutos desde la medianoche. */
function leerHora(objeto: Objeto, campo: string, ruta: string, acc: Acumulador): number | undefined {
  const valor = objeto[campo];
  const rutaCampo = `${ruta}.${campo}`;
  const esperado = "hora con formato HH:MM entre 00:00 y 24:00";
  if (valor === undefined) {
    acc.agregar("CAMPO_FALTANTE", rutaCampo, esperado, null);
    return undefined;
  }
  if (typeof valor !== "string") {
    acc.agregar("TIPO_INCORRECTO", rutaCampo, `texto con ${esperado}`, describir(valor));
    return undefined;
  }
  const minutos = horaAMinutos(valor);
  if (minutos === undefined) {
    acc.agregar("RANGO_INVALIDO", rutaCampo, esperado, describir(valor));
    return undefined;
  }
  return minutos;
}

/** "07:30" → 450. Devuelve undefined si el formato o el rango no son válidos. */
export function horaAMinutos(texto: string): number | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(texto);
  if (!m) return undefined;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (minutos > 59 || horas > 24 || (horas === 24 && minutos !== 0)) return undefined;
  return horas * 60 + minutos;
}

/** 450 → "07:30". */
export function formatearHora(minutos: number): string {
  const limite = Math.min(Math.max(minutos, 0), MINUTOS_DEL_DIA);
  const horas = Math.floor(limite / 60);
  const resto = limite % 60;
  return `${String(horas).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

/* JSON mal formado ------------------------------------------------- */

function ubicarFallo(texto: string, mensaje: string): { linea: number; columna: number } {
  const directo = /line (\d+) column (\d+)/i.exec(mensaje);
  if (directo) return { linea: Number(directo[1]), columna: Number(directo[2]) };

  const posicion = /position (\d+)/i.exec(mensaje);
  const indice = posicion ? Math.min(Number(posicion[1]), texto.length) : texto.length;
  const antes = texto.slice(0, indice);
  const linea = antes.split("\n").length;
  const columna = indice - (antes.lastIndexOf("\n") + 1) + 1;
  return { linea, columna };
}
