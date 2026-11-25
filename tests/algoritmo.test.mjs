/**
 * Pruebas del algoritmo completo (niveles 0 a 8), el validador y la exportación.
 * No necesitan Docker ni base de datos:
 *
 *   pnpm test
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ejecutar, buscarSelecciones, LIMITE_POR_DEFECTO } from "../src/domain/scheduling/generador.ts";
import { exportarJSON, exportarTXT } from "../src/domain/scheduling/exportar.ts";
import { cumpleNivel, huecosDelDia } from "../src/domain/scheduling/niveles.ts";
import { preprocesar } from "../src/domain/scheduling/preprocesamiento.ts";
import { parsearJson, validarEntrada, validarOLanzar } from "../src/domain/scheduling/validacion.ts";
import {
  casoBaseValido,
  casoConVariosErrores,
  casosInvalidos,
  generarCaso,
  generarCasoSinCruces,
} from "../scripts/datos-sinteticos.ts";

/* ------------------------------------------------------------------ */
/* Ayudas para armar casos pequeños                                   */
/* ------------------------------------------------------------------ */

/** "lunes 07:00-09:00" → { dia, inicio, fin } */
function ses(texto) {
  const [dia, rango] = texto.split(" ");
  const [inicio, fin] = rango.split("-");
  return { dia, inicio, fin };
}

/**
 * materias: [id, creditos]; grupos: [id, materiaId, profesorId, cupos, [sesiones], inscritos?];
 * perfil: campos extra del estudiante (materias como [id, prioridad, preferidos?]).
 */
function caso({ materias, grupos, perfil }) {
  const profesores = [...new Set(grupos.map((g) => g[2]))].map((id) => ({ id, nombre: `Prof ${id}` }));
  return {
    catalogo: {
      materias: materias.map(([id, creditos]) => ({ id, nombre: `Materia ${id}`, creditos })),
      profesores,
      grupos: grupos.map(([id, materiaId, profesorId, cupos, sesiones, inscritos = []]) => ({
        id,
        materiaId,
        profesorId,
        cuposDisponibles: cupos,
        inscritos,
        sesiones: sesiones.map(ses),
      })),
    },
    estudiante: {
      id: "E1",
      semestre: 1,
      ...perfil,
      materias: perfil.materias.map(([materiaId, prioridad, profesoresPreferidos]) => ({
        materiaId,
        prioridad,
        ...(profesoresPreferidos ? { profesoresPreferidos } : {}),
      })),
    },
  };
}

function instanciaDe(entrada) {
  const datos = validarOLanzar(entrada);
  return preprocesar(datos.catalogo, datos.estudiante);
}

/** Identificadores de grupos de un horario del resultado, p. ej. "A-1+B-2". */
function llave(horario) {
  return horario.asignaciones
    .map((a) => a.grupoId)
    .sort()
    .join("+");
}

function llaves(selecciones) {
  return selecciones.map((s) => s.map((g) => g.id).sort().join("+")).sort();
}

/* ------------------------------------------------------------------ */
/* Validación                                                         */
/* ------------------------------------------------------------------ */

test("el caso base es válido y los campos omitidos toman su valor neutro", () => {
  const { errores, datos } = validarEntrada(casoBaseValido());
  assert.deepEqual(errores, []);
  assert.equal(datos.estudiante.creditosMax, 8);

  const minimo = casoBaseValido();
  for (const campo of ["creditosMin", "creditosMax", "franja", "huecos", "diasLibres", "amigos", "minCoincidenciasAmigos"]) {
    delete minimo.estudiante[campo];
  }
  const neutro = validarOLanzar(minimo).estudiante;
  assert.equal(neutro.creditosMin, 0);
  assert.equal(neutro.creditosMax, null);
  assert.equal(neutro.franja, null);
  assert.equal(neutro.huecos.tipo, "indiferente");
  assert.deepEqual(neutro.diasLibres, []);
  assert.deepEqual(neutro.amigos, []);
  assert.equal(neutro.minCoincidenciasAmigos, 0);
});

for (const invalido of casosInvalidos()) {
  test(`${invalido.codigoEsperado}: ${invalido.descripcion}`, () => {
    const { resultado } = ejecutar(invalido.texto);
    assert.equal(resultado.estado, "ARCHIVO_INVALIDO");
    assert.deepEqual(resultado.horarios, []);
    const error = resultado.errores.find((e) => e.codigo === invalido.codigoEsperado);
    assert.ok(error, `debía haber un error ${invalido.codigoEsperado}: ${JSON.stringify(resultado.errores)}`);
    assert.equal(error.ruta, invalido.rutaEsperada);
    assert.ok(error.mensaje.length > 0);
    assert.ok(error.esperado.length > 0);
  });
}

test("JSON_MAL_FORMADO indica la línea y la columna del fallo", () => {
  assert.throws(
    () => parsearJson('{\n  "a": 1,\n  "b": ,\n}'),
    (error) => {
      assert.equal(error.errores.length, 1);
      assert.match(error.errores[0].encontrado, /línea \d+, columna \d+/);
      return true;
    },
  );
});

test("todos los errores se reportan juntos, sin detenerse en el primero", () => {
  const { resultado } = ejecutar(casoConVariosErrores());
  const codigos = new Set(resultado.errores.map((e) => e.codigo));
  assert.ok(resultado.errores.length >= 5, `solo ${resultado.errores.length} errores`);
  for (const esperado of ["VALOR_NO_PERMITIDO", "TIPO_INCORRECTO", "REFERENCIA_INEXISTENTE", "CAMPO_FALTANTE"]) {
    assert.ok(codigos.has(esperado), `falta ${esperado}`);
  }
});

test("un archivo que no es un objeto tiene estructura inválida", () => {
  const { resultado } = ejecutar("[1, 2, 3]");
  assert.equal(resultado.errores[0].codigo, "ESTRUCTURA_INVALIDA");
});

test("las sesiones de un mismo grupo que se traslapan son un rango inválido", () => {
  const entrada = casoBaseValido();
  entrada.catalogo.grupos[0].sesiones = [
    { dia: "lunes", inicio: "07:00", fin: "09:00" },
    { dia: "lunes", inicio: "08:00", fin: "10:00" },
  ];
  const { errores } = validarEntrada(entrada);
  assert.equal(errores[0].codigo, "RANGO_INVALIDO");
  assert.equal(errores[0].ruta, "catalogo.grupos[0].sesiones");
});

test("los días se normalizan: mayúsculas y sin tilde son válidos", () => {
  const entrada = casoBaseValido();
  entrada.catalogo.grupos[1].sesiones[0].dia = "Martes";
  entrada.catalogo.grupos[1].sesiones[1].dia = "JUEVES";
  entrada.estudiante.diasLibres = ["Miercoles", "SÁBADO"];
  const { errores, datos } = validarEntrada(entrada);
  assert.deepEqual(errores, []);
  assert.deepEqual(datos.estudiante.diasLibres, ["miércoles", "sábado"]);
});

/* ------------------------------------------------------------------ */
/* Nivel 0: restricciones duras                                       */
/* ------------------------------------------------------------------ */

const CASO_NIVEL_0 = () =>
  caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["A-2", "A", "P1", 5, ["martes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["lunes 10:00-12:00"]], // empieza justo cuando A-1 termina
      ["B-2", "B", "P1", 5, ["lunes 09:00-11:00"]], // se cruza con A-1
    ],
    perfil: { materias: [["A", "media"], ["B", "media"]] },
  });

test("nivel 0: sin cruces; terminar justo cuando otra empieza NO es un cruce", () => {
  const inst = instanciaDe(CASO_NIVEL_0());
  const nivel0 = llaves(buscarSelecciones(inst, 0).selecciones);
  // 3 × 3 combinaciones − vacía − (A-1 con B-2)
  assert.equal(nivel0.length, 7);
  assert.ok(nivel0.includes("A-1+B-1"), "10:00 contiguo debe permitirse");
  assert.ok(!nivel0.includes("A-1+B-2"), "9:00–11:00 se cruza con 8:00–10:00");
});

test("nivel 0: un grupo sin cupos nunca aparece en un horario", () => {
  const entrada = CASO_NIVEL_0();
  entrada.catalogo.grupos.find((g) => g.id === "B-1").cuposDisponibles = 0;
  const inst = instanciaDe(entrada);
  for (const sel of buscarSelecciones(inst, 0).selecciones) {
    assert.ok(sel.every((g) => g.id !== "B-1"));
  }
});

/* ------------------------------------------------------------------ */
/* Nivel 1: prioridad                                                 */
/* ------------------------------------------------------------------ */

test("nivel 1: maximalidad — no se puede dejar fuera algo que cabe", () => {
  const inst = instanciaDe(CASO_NIVEL_0());
  const nivel1 = llaves(buscarSelecciones(inst, 1).selecciones);
  // (A-1 sola) no vale porque B-1 todavía se puede agregar; solo quedan los completos.
  assert.deepEqual(nivel1, ["A-1+B-1", "A-2+B-1", "A-2+B-2"]);
});

test("nivel 1: ejemplo del informe — la media pesa más que la baja", () => {
  // 1 alta, 2 medias y 1 baja de 3 créditos, máximo 9. Alta + media + baja NO es válido
  // porque la otra media se podría poner en lugar de la baja.
  const entrada = caso({
    materias: [["W", 3], ["X", 3], ["Y", 3], ["Z", 3]],
    grupos: [
      ["W-1", "W", "P1", 5, ["lunes 07:00-08:00"]],
      ["X-1", "X", "P1", 5, ["martes 07:00-08:00"]],
      ["Y-1", "Y", "P1", 5, ["miércoles 07:00-08:00"]],
      ["Z-1", "Z", "P1", 5, ["jueves 07:00-08:00"]],
    ],
    perfil: {
      creditosMax: 9,
      materias: [["W", "alta"], ["X", "media"], ["Y", "media"], ["Z", "baja"]],
    },
  });
  const inst = instanciaDe(entrada);
  // En el nivel 1 todavía no se mira el máximo de créditos; con él (nivel 2) queda una sola opción.
  assert.deepEqual(llaves(buscarSelecciones(inst, 2).selecciones), ["W-1+X-1+Y-1"]);
});

test("nivel 1: toda materia alta debe estar incluida", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["martes 08:00-10:00"]],
    ],
    perfil: { materias: [["A", "alta"], ["B", "baja"]] },
  });
  const nivel1 = buscarSelecciones(instanciaDe(entrada), 1).selecciones;
  assert.ok(nivel1.length > 0 && nivel1.every((s) => s.some((g) => g.materiaId === "A")));
});

/* ------------------------------------------------------------------ */
/* Nivel 2: créditos                                                  */
/* ------------------------------------------------------------------ */

test("nivel 2: el total de créditos debe llegar al mínimo", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["martes 08:00-10:00"]],
    ],
    perfil: { creditosMin: 7, materias: [["A", "alta"], ["B", "baja"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(resultado.nivelAlcanzado, 1);
  // El primero es el que impidió avanzar; los siguientes ya no se pudieron verificar.
  assert.deepEqual(resultado.criteriosNoCumplidos, ["creditos", "almuerzo"]);
  assert.equal(resultado.horariosNivelAlcanzado.length, 1);
});

test("nivel 2: no se puede pasar el máximo de créditos", () => {
  const entrada = caso({
    materias: [["A", 4], ["B", 4], ["C", 4]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["martes 08:00-10:00"]],
      ["C-1", "C", "P1", 5, ["miércoles 08:00-10:00"]],
    ],
    perfil: { creditosMax: 8, materias: [["A", "alta"], ["B", "media"], ["C", "media"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "OK");
  for (const horario of resultado.horarios) assert.ok(horario.creditosTotales <= 8);
  assert.deepEqual(resultado.horarios.map(llave), ["A-1+B-1", "A-1+C-1"]);
});

/* ------------------------------------------------------------------ */
/* Niveles 3 a 8                                                      */
/* ------------------------------------------------------------------ */

const UNA_MATERIA = (perfil, grupos) =>
  caso({ materias: [["A", 3]], grupos, perfil: { materias: [["A", "alta"]], ...perfil } });

test("nivel 3: el almuerzo (13:00 a 14:00) queda libre", () => {
  const entrada = UNA_MATERIA({}, [
    ["G1", "A", "P1", 5, ["lunes 12:00-13:00"]], // termina justo cuando empieza el almuerzo
    ["G2", "A", "P1", 5, ["lunes 12:30-13:30"]],
    ["G3", "A", "P1", 5, ["lunes 13:00-14:00"]],
    ["G4", "A", "P1", 5, ["lunes 14:00-15:00"]], // empieza justo cuando termina
  ]);
  const inst = instanciaDe(entrada);
  assert.equal(buscarSelecciones(inst, 2).selecciones.length, 4);
  assert.deepEqual(llaves(buscarSelecciones(inst, 3).selecciones), ["G1", "G4"]);
});

test("nivel 4: huecos ninguno / cortos, sin contar el almuerzo", () => {
  const grupos = [
    ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
    ["B-4", "B", "P1", 5, ["lunes 10:00-11:00"]], // hueco 0
    ["B-1", "B", "P1", 5, ["lunes 11:00-12:00"]], // hueco 60
    ["B-2", "B", "P1", 5, ["lunes 12:00-13:00"]], // hueco 120
    ["B-3", "B", "P1", 5, ["lunes 14:00-15:00"]], // 240 − 60 de almuerzo = 180
  ];
  const resultados = (huecos) =>
    llaves(
      buscarSelecciones(
        instanciaDe(
          caso({
            materias: [["A", 3], ["B", 3]],
            grupos,
            perfil: { materias: [["A", "alta"], ["B", "alta"]], huecos },
          }),
        ),
        4,
      ).selecciones,
    );
  assert.deepEqual(resultados({ tipo: "ninguno" }), ["A-1+B-4"]);
  assert.deepEqual(resultados({ tipo: "cortos", maxMinutos: 60 }), ["A-1+B-1", "A-1+B-4"]);
  assert.deepEqual(resultados({ tipo: "cortos", maxMinutos: 120 }), ["A-1+B-1", "A-1+B-2", "A-1+B-4"]);
  assert.equal(resultados({ tipo: "indiferente" }).length, 4);
});

test("huecosDelDia no cuenta los minutos que caen dentro del almuerzo", () => {
  const g = (...sesiones) => ({
    id: "g", materiaId: "A", profesorId: "P", cuposDisponibles: 1, inscritos: [],
    sesiones: sesiones.map((s) => {
      const { dia, inicio, fin } = ses(s);
      const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
      return { dia, inicio: aMin(inicio), fin: aMin(fin) };
    }),
  });
  assert.deepEqual(huecosDelDia([g("lunes 12:00-13:00", "lunes 14:00-15:00")], "lunes"), [0]);
  assert.deepEqual(huecosDelDia([g("lunes 11:00-12:00", "lunes 14:00-15:00")], "lunes"), [60]);
  assert.deepEqual(huecosDelDia([g("lunes 08:00-09:00", "martes 08:00-09:00")], "lunes"), []);
});

test("nivel 5: la franja es inclusiva en sus dos extremos", () => {
  const entrada = UNA_MATERIA({ franja: { inicio: "08:00", fin: "13:00" } }, [
    ["G1", "A", "P1", 5, ["lunes 08:00-10:00"]],
    ["G2", "A", "P1", 5, ["lunes 07:30-09:00"]],
    ["G3", "A", "P1", 5, ["lunes 11:00-13:00"]],
    ["G4", "A", "P1", 5, ["lunes 12:00-13:30"]],
  ]);
  assert.deepEqual(llaves(buscarSelecciones(instanciaDe(entrada), 5).selecciones), ["G1", "G3"]);
});

test("nivel 6: ninguna sesión en un día libre", () => {
  const entrada = UNA_MATERIA({ diasLibres: ["viernes"] }, [
    ["G1", "A", "P1", 5, ["lunes 08:00-10:00"]],
    ["G2", "A", "P1", 5, ["viernes 08:00-10:00"]],
    ["G3", "A", "P1", 5, ["lunes 08:00-10:00", "viernes 10:00-12:00"]],
  ]);
  assert.deepEqual(llaves(buscarSelecciones(instanciaDe(entrada), 6).selecciones), ["G1"]);
});

test("nivel 7: solo profesores preferidos, y el orden de la lista ordena los resultados", () => {
  const entrada = caso({
    materias: [["A", 3]],
    grupos: [
      ["G1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["G2", "A", "P2", 5, ["martes 08:00-10:00"]],
      ["G3", "A", "P3", 5, ["miércoles 08:00-10:00"]],
    ],
    perfil: { materias: [["A", "alta", ["P2", "P1"]]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "OK");
  assert.deepEqual(resultado.horarios.map(llave), ["G2", "G1"]); // P2 (posición 0) antes que P1 (1)
  assert.deepEqual(resultado.horarios.map((h) => h.id), [1, 2]);
});

test("nivel 8: cada pareja (amigo, materia) cuenta como una coincidencia", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"], ["E8"]],
      ["A-2", "A", "P1", 5, ["martes 08:00-10:00"], ["E8", "E9"]],
      ["B-1", "B", "P1", 5, ["miércoles 08:00-10:00"], ["E9"]],
    ],
    perfil: { materias: [["A", "alta"], ["B", "alta"]], amigos: ["E8", "E9"], minCoincidenciasAmigos: 3 },
  });
  // A-1+B-1 = 2 coincidencias; A-2+B-1 = 3 (dos amigos en A, uno en B)
  assert.deepEqual(llaves(buscarSelecciones(instanciaDe(entrada), 8).selecciones), ["A-2+B-1"]);
});

test("desempate: sin preferencias, todos empatan y se ordenan de forma estable", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-2", "B", "P1", 5, ["martes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["martes 10:00-12:00"]],
    ],
    perfil: { materias: [["A", "alta"], ["B", "alta"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.deepEqual(resultado.horarios.map(llave), ["A-1+B-1", "A-1+B-2"]);
});

/* ------------------------------------------------------------------ */
/* Estados y motivos                                                  */
/* ------------------------------------------------------------------ */

test("materia alta sin grupos: SIN_HORARIO inmediato indicando cuál es", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]]],
    perfil: { materias: [["A", "media"], ["B", "alta"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.match(resultado.motivo, /B/);
  assert.deepEqual(resultado.horarios, []);
});

test("materia media sin grupos: se omite con la razón 'sin grupos en el catálogo'", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]]],
    perfil: { materias: [["A", "alta"], ["B", "media"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "OK");
  assert.deepEqual(resultado.horarios[0].omitidas, [
    { materiaId: "B", razones: ["sin grupos en el catálogo"] },
  ]);
});

test("dos materias altas que se cruzan: SIN_HORARIO, motivo con la materia que no cabe", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["lunes 09:00-11:00"]],
    ],
    perfil: { materias: [["A", "alta"], ["B", "alta"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.match(resultado.motivo, /materia alta .*\(B\)/);
  assert.equal(resultado.nivelAlcanzado, 0);
  assert.equal(resultado.criteriosNoCumplidos[0], "prioridad");
});

test("nivel alcanzado: se informa hasta dónde se llegó y qué criterio falla", () => {
  const entrada = UNA_MATERIA({ diasLibres: ["viernes"] }, [
    ["G1", "A", "P1", 5, ["viernes 08:00-10:00"]],
  ]);
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(resultado.motivo, "Ningún horario cumple todos los criterios.");
  assert.equal(resultado.nivelAlcanzado, 5);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["diasLibres"]);
  assert.deepEqual(resultado.horariosNivelAlcanzado.map(llave), ["G1"]);
});

test("materia con profesores preferidos que no tiene grupos con ellos: no hay horario", () => {
  const entrada = caso({
    materias: [["A", 3]],
    grupos: [["G1", "A", "P1", 5, ["lunes 08:00-10:00"]], ["G2", "A", "P2", 5, ["martes 08:00-10:00"]]],
    perfil: { materias: [["A", "baja", ["P9"]]] },
  });
  // P9 no existe en el catálogo → referencia inexistente; se agrega y se vuelve a probar
  entrada.catalogo.profesores.push({ id: "P9", nombre: "Sin grupos" });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(resultado.nivelAlcanzado, 6);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["profesor"]);
});

test("criteriosActivos: solo los declarados (el almuerzo siempre)", () => {
  const entrada = UNA_MATERIA({}, [["G1", "A", "P1", 5, ["lunes 08:00-10:00"]]]);
  assert.deepEqual(ejecutar(entrada).resultado.criteriosActivos, ["almuerzo"]);
  const conTodo = ejecutar(casoBaseValido()).resultado;
  assert.deepEqual(conTodo.criteriosActivos, ["almuerzo", "huecos", "franja", "diasLibres", "profesor", "amigos"]);
});

test("omitidas: razones comprobadas (créditos, cruce y cupos)", () => {
  const entrada = caso({
    materias: [["A", 4], ["B", 4], ["C", 3], ["D", 2]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["martes 08:00-10:00"]],
      ["C-1", "C", "P1", 5, ["lunes 09:00-11:00"]], // se cruza con A-1
      ["D-1", "D", "P1", 0, ["jueves 08:00-10:00"]], // sin cupos
    ],
    perfil: { creditosMax: 8, materias: [["A", "alta"], ["B", "alta"], ["C", "baja"], ["D", "baja"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "OK");
  const omitidas = Object.fromEntries(resultado.horarios[0].omitidas.map((o) => [o.materiaId, o.razones]));
  assert.deepEqual(omitidas.C, ["supera creditosMax", "se cruza con A"]);
  assert.deepEqual(omitidas.D, ["supera creditosMax", "sin cupos"]);
});

/* ------------------------------------------------------------------ */
/* Tamaño del espacio de búsqueda (sección 2.6)                       */
/* ------------------------------------------------------------------ */

test("7 materias × 4 grupos: 16.384 horarios que las incluyen todas y 78.124 sin exigirlo", () => {
  const inst = instanciaDe(generarCasoSinCruces(7, 4, "media"));
  // Nivel 0 admite omitir cualquier materia: 5^7 combinaciones menos la vacía.
  assert.equal(buscarSelecciones(inst, 0, Infinity).selecciones.length, 5 ** 7 - 1);
  // Desde el nivel 1, como todo cabe, la maximalidad obliga a incluirlas todas: 4^7.
  assert.equal(buscarSelecciones(inst, 8, Infinity).selecciones.length, 4 ** 7);
});

test("el límite de horarios corta la búsqueda y lo informa", () => {
  const entrada = generarCasoSinCruces(5, 3, "alta");
  const { resultado } = ejecutar(entrada, 10);
  assert.equal(resultado.estado, "OK");
  assert.equal(resultado.horarios.length, 10);
  assert.equal(resultado.truncado, true);
  assert.ok(LIMITE_POR_DEFECTO >= 1000);
});

/* ------------------------------------------------------------------ */
/* Comparación contra fuerza bruta                                    */
/* ------------------------------------------------------------------ */

/** Todas las combinaciones (cada materia: omitida o con uno de sus grupos), sin la vacía. */
function* combinaciones(inst) {
  const listas = inst.solicitadas.map((m) => [null, ...(inst.gruposDe.get(m.materiaId) ?? [])]);
  const actual = [];
  function* recorrer(i) {
    if (i === listas.length) {
      if (actual.length > 0) yield [...actual];
      return;
    }
    for (const opcion of listas[i]) {
      if (opcion) actual.push(opcion);
      yield* recorrer(i + 1);
      if (opcion) actual.pop();
    }
  }
  yield* recorrer(0);
}

test("la búsqueda con podas coincide con la fuerza bruta en todos los niveles (150 casos aleatorios)", () => {
  let niveles = 0;
  let conSolucionCompleta = 0;
  for (let semilla = 1; semilla <= 150; semilla += 1) {
    const entrada = generarCaso(semilla, { materias: 3 + (semilla % 3), gruposPorMateria: 2 });
    const inst = instanciaDe(entrada);
    const todas = [...combinaciones(inst)];
    let anterior = null;

    for (let nivel = 0; nivel <= 8; nivel += 1) {
      const esperado = llaves(todas.filter((sel) => cumpleNivel(nivel, sel, inst)));
      const obtenido = llaves(buscarSelecciones(inst, nivel, Infinity).selecciones);
      assert.deepEqual(obtenido, esperado, `semilla ${semilla}, nivel ${nivel}`);

      // Los niveles son acumulativos: al subir de nivel el conjunto solo se achica.
      if (anterior) assert.ok(obtenido.every((k) => anterior.includes(k)), `semilla ${semilla}: nivel ${nivel} no está contenido en el anterior`);
      anterior = obtenido;
      niveles += 1;
      if (nivel === 8 && obtenido.length > 0) conSolucionCompleta += 1;
    }
  }
  assert.equal(niveles, 150 * 9);
  // Que el generador produzca de todo: algunos casos con solución y otros sin ella.
  assert.ok(conSolucionCompleta > 10, `solo ${conSolucionCompleta} casos con solución`);
  assert.ok(conSolucionCompleta < 150, "todos los casos tenían solución: el generador es muy fácil");
});

test("todo horario devuelto cumple los 9 niveles y ninguno se repite", () => {
  for (let semilla = 200; semilla < 230; semilla += 1) {
    const { resultado, instancia } = ejecutar(generarCaso(semilla));
    if (resultado.estado !== "OK") continue;
    const vistos = new Set();
    for (const horario of resultado.horarios) {
      const grupos = horario.asignaciones.map((a) => instancia.grupos.get(a.grupoId));
      assert.ok(cumpleNivel(8, grupos, instancia), `semilla ${semilla}, horario ${horario.id}`);
      assert.ok(!vistos.has(llave(horario)));
      vistos.add(llave(horario));
    }
  }
});

/* ------------------------------------------------------------------ */
/* Exportación                                                        */
/* ------------------------------------------------------------------ */

test("exportarJSON sigue la estructura de la sección 2.3", () => {
  const { resultado } = ejecutar(casoBaseValido());
  assert.equal(resultado.estado, "OK");
  const json = JSON.parse(exportarJSON(resultado));
  assert.deepEqual(Object.keys(json), ["estudianteId", "estado", "criteriosActivos", "motivo", "horarios"]);
  assert.equal(json.estudianteId, "E101");
  assert.equal(json.motivo, null);
  assert.deepEqual(Object.keys(json.horarios[0]), ["id", "materias", "omitidas", "creditosTotales"]);
  assert.deepEqual(json.horarios[0].materias[0], { materiaId: "ED101", grupoId: "ED101-01" });
});

test("exportarTXT sigue el formato de la sección 2.3", () => {
  const { resultado, instancia } = ejecutar(casoBaseValido());
  const txt = exportarTXT(resultado, instancia.catalogo);
  const lineas = txt.split("\n");
  assert.equal(lineas[0], "HORARIOS PARA E101");
  assert.equal(lineas[1], "Estado: OK");
  assert.equal(lineas[2], "Criterios activos: almuerzo, huecos, franja, diasLibres, profesor, amigos");
  assert.match(lineas[3], /^Total de horarios: \d+$/);
  assert.ok(txt.includes("  ED101  Ecuaciones Diferenciales  grupo ED101-01"));
  assert.ok(txt.includes("    profesor Profesor Ejemplo"));
  assert.ok(txt.includes("    lunes 07:00 a 09:00"));
  assert.ok(txt.includes("  Omitidas: "));
});

test("el resultado de un archivo inválido se exporta con su lista de errores", () => {
  const { resultado } = ejecutar(casosInvalidos()[4].texto);
  const json = JSON.parse(exportarJSON(resultado));
  assert.equal(json.estado, "ARCHIVO_INVALIDO");
  assert.equal(json.errores[0].codigo, "VALOR_NO_PERMITIDO");
  assert.deepEqual(json.horarios, []);
  const txt = exportarTXT(resultado, null);
  assert.match(txt, /ARCHIVO INVÁLIDO/);
  assert.match(txt, /\[VALOR_NO_PERMITIDO\] catalogo\.grupos\[0\]\.sesiones\[0\]\.dia/);
});
