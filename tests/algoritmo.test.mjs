/**
 * Pruebas del algoritmo completo (niveles 0 a 8), el validador y la exportación.
 * No necesitan Docker ni base de datos:
 *
 *   pnpm test
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ejecutar, buscarSelecciones, SIN_LIMITE } from "../src/domain/scheduling/generador.ts";
import {
  exportarHorarioJSON,
  exportarHorarioTXT,
  exportarJSON,
  exportarTXT,
  indexarCatalogo,
} from "../src/domain/scheduling/exportar.ts";
import { generarDesdeArchivo, validarArchivo, vistaDeCompacto } from "../src/application/scheduling/ejecutar-archivo.ts";
import {
  textoDeHorario,
  textoDeResultado,
  validezDeHorario,
} from "../src/application/scheduling/exportar-bajo-demanda.ts";
import { verificarHorarioGuardado } from "../src/application/scheduling/validar-horario-guardado.ts";
import {
  criteriosIncumplidosDe,
  cumpleNivel,
  cumpleSoloNivel,
  huecosDelDia,
  NOMBRE_DE_NIVEL,
} from "../src/domain/scheduling/niveles.ts";
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
  // Y es el único horario válido de la versión final: W + X + Z no vale (Y debe entrar antes que Z).
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "OK");
  assert.deepEqual(resultado.horarios.map(llave), ["W-1+X-1+Y-1"]);
  const sel = (...ids) => ids.map((id) => inst.grupos.get(id));
  assert.equal(cumpleNivel(8, sel("W-1", "X-1", "Z-1"), inst), false);
});

/** Caso de la revisión: A alta el lunes, B baja solo el viernes, y el viernes se pide libre. */
const CASO_MAXIMALIDAD = () =>
  caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["viernes 08:00-10:00"]],
    ],
    perfil: {
      creditosMin: 3,
      creditosMax: 9,
      diasLibres: ["viernes"],
      materias: [["A", "alta"], ["B", "baja"]],
    },
  });

test("nivel 1: una materia omitida solo obliga a entrar si el horario resultante cumple lo demás", () => {
  // Meter B rompe los días libres, así que B no obliga: A sola es un horario válido.
  const { resultado } = ejecutar(CASO_MAXIMALIDAD());
  assert.equal(resultado.estado, "OK");
  assert.deepEqual(resultado.horarios.map(llave), ["A-1"]);
  assert.deepEqual(resultado.horarios[0].omitidas, [
    { materiaId: "B", razones: ["tiene clase en día libre (viernes)"] },
  ]);
});

test("nivel 1: los conjuntos de cada nivel ya no están anidados (la maximalidad del nivel k mira hasta k)", () => {
  const inst = instanciaDe(CASO_MAXIMALIDAD());
  // Hasta el nivel 5 los días libres no están en juego: B debe entrar.
  assert.deepEqual(llaves(buscarSelecciones(inst, 5).selecciones), ["A-1+B-1"]);
  // Desde el 6, meter B rompería los días libres: el horario es A sola, que NO está en el nivel 5.
  assert.deepEqual(llaves(buscarSelecciones(inst, 6).selecciones), ["A-1"]);
  assert.deepEqual(llaves(buscarSelecciones(inst, 8).selecciones), ["A-1"]);
});

test("nivel 1: tampoco obliga a cambiar una baja por una media si el cambio rompe otro criterio", () => {
  // M (media) solo tiene grupo el viernes (día libre): no desplaza a la baja L.
  const entrada = caso({
    materias: [["A", 3], ["M", 3], ["L", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["M-1", "M", "P1", 5, ["viernes 08:00-10:00"]],
      ["L-1", "L", "P1", 5, ["martes 08:00-10:00"]],
    ],
    perfil: {
      creditosMax: 6,
      diasLibres: ["viernes"],
      materias: [["A", "alta"], ["M", "media"], ["L", "baja"]],
    },
  });
  const { resultado, instancia } = ejecutar(entrada);
  assert.equal(resultado.estado, "OK");
  assert.deepEqual(resultado.horarios.map(llave), ["A-1+L-1"]);
  // Sin el día libre en juego (nivel 5), M sí desplaza a L.
  assert.deepEqual(llaves(buscarSelecciones(instancia, 5).selecciones), ["A-1+M-1"]);
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
  // Solo "creditos" falla: el único horario del nivel 1 (A-1 + B-1, ambos de mañana) sí respeta
  // el almuerzo, así que "almuerzo" no se informa como incumplido.
  assert.deepEqual(resultado.criteriosNoCumplidos, ["creditos"]);
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

test("materia alta sin grupos: se busca con las demás y esos horarios NO son válidos", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3], ["C", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["C-1", "C", "P1", 5, ["martes 08:00-10:00"]],
    ],
    perfil: { materias: [["A", "media"], ["B", "alta"], ["C", "baja"]] },
  });
  const { resultado, instancia } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(
    resultado.motivo,
    "La materia alta Materia B (B) no se pudo inscribir porque no tiene grupos en el catálogo.",
  );
  assert.deepEqual(resultado.horarios, []);
  // Con las demás materias se arma el horario completo (A y C), con B omitida por no tener grupos.
  assert.deepEqual(resultado.horariosNivelAlcanzado.map(llave), ["A-1+C-1"]);
  assert.deepEqual(resultado.horariosNivelAlcanzado[0].omitidas, [
    { materiaId: "B", razones: ["sin grupos en el catálogo"] },
  ]);
  // Estrictamente solo cumple el nivel 0: sin una materia alta no se pasa la prioridad.
  assert.equal(resultado.nivelAlcanzado, 0);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["prioridad"]);
  const grupos = ["A-1", "C-1"].map((id) => instancia.grupos.get(id));
  assert.deepEqual(
    criteriosIncumplidosDe(grupos, instancia).map((i) => [i.criterio, i.detalle]),
    [["prioridad", "falta la materia alta Materia B (B): no tiene grupos en el catálogo"]],
  );
});

test("materia alta sin grupos y las demás tampoco cumplen todo: se informa la alta y el resto", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [["A-1", "A", "P1", 5, ["viernes 08:00-10:00"]]],
    perfil: { diasLibres: ["viernes"], materias: [["A", "media"], ["B", "alta"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.match(resultado.motivo, /Materia B \(B\) no se pudo inscribir/);
  assert.equal(resultado.nivelAlcanzado, 0);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["prioridad", "diasLibres"]);
  assert.deepEqual(resultado.horariosNivelAlcanzado.map(llave), ["A-1"]);
});

test("materia alta sin grupos y ninguna otra con grupos: solo el aviso, sin horarios", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3], ["C", 3]],
    grupos: [["X-1", "A", "P1", 5, ["lunes 08:00-10:00"]]],
    perfil: { materias: [["B", "alta"], ["C", "alta"]] },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(
    resultado.motivo,
    "Las materias altas Materia B (B) y Materia C (C) no se pudieron inscribir porque no tienen grupos en el catálogo.",
  );
  assert.deepEqual(resultado.horariosNivelAlcanzado, []);
  assert.equal(resultado.nivelAlcanzado, -1);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["prioridad"]);
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
  assert.equal(SIN_LIMITE, Infinity);
});

test("sin límite pedido se devuelven TODOS los horarios (no hay tope oculto de 5000)", () => {
  // 7 materias altas × 4 grupos sin cruces: 4^7 = 16.384 horarios, más que cualquier tope habitual.
  const { resultado } = ejecutar(generarCasoSinCruces(7, 4, "alta"));
  assert.equal(resultado.estado, "OK");
  assert.equal(resultado.horarios.length, 4 ** 7);
  assert.equal(resultado.truncado, false);
  assert.equal(new Set(resultado.horarios.map((h) => h.asignaciones.map((a) => a.grupoId).join("|"))).size, 4 ** 7);
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
  let noAnidados = 0;
  for (let semilla = 1; semilla <= 150; semilla += 1) {
    const entrada = generarCaso(semilla, { materias: 3 + (semilla % 3), gruposPorMateria: 2 });
    const inst = instanciaDe(entrada);
    const todas = [...combinaciones(inst)];
    let anterior = null;

    for (let nivel = 0; nivel <= 8; nivel += 1) {
      const esperado = llaves(todas.filter((sel) => cumpleNivel(nivel, sel, inst)));
      const obtenido = llaves(buscarSelecciones(inst, nivel, Infinity).selecciones);
      assert.deepEqual(obtenido, esperado, `semilla ${semilla}, nivel ${nivel}`);

      // Los conjuntos ya no están anidados (la maximalidad del nivel k mira los criterios
      // hasta k), pero "el nivel tiene horarios" sí es monótono: si el nivel k tiene, el
      // k − 1 también. Es lo que necesita la búsqueda binaria del nivel alcanzado.
      if (anterior) {
        assert.ok(obtenido.length === 0 || anterior.length > 0, `semilla ${semilla}: nivel ${nivel} tiene horarios y el anterior no`);
        if (obtenido.some((k) => !anterior.includes(k))) noAnidados += 1;
      }
      anterior = obtenido;
      niveles += 1;
      if (nivel === 8 && obtenido.length > 0) conSolucionCompleta += 1;
    }
  }
  assert.equal(niveles, 150 * 9);
  assert.ok(noAnidados > 0, "se esperaba ver algún nivel que no está contenido en el anterior");
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
/* Casos límite (resultados calculados a mano, sin pasar por el algoritmo) */
/* ------------------------------------------------------------------ */

test("diagnóstico: el que bloquea y los que ningún horario del nivel cumple; no los que sí se cumplen", () => {
  // A-1 lunes 08–09 y B-1 lunes 11–12: único horario con las dos altas, con 120 min de hueco.
  // huecos "ninguno" falla (bloquea, nivel 4). La franja 08–12 sí se cumple, así que no se
  // informa. Los días libres (lunes) no los cumple nadie, así que sí se informa.
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-09:00"]],
      ["B-1", "B", "P1", 5, ["lunes 11:00-12:00"]],
    ],
    perfil: {
      huecos: { tipo: "ninguno" },
      franja: { inicio: "08:00", fin: "12:00" },
      diasLibres: ["lunes"],
      materias: [["A", "alta"], ["B", "alta"]],
    },
  });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(resultado.nivelAlcanzado, 3);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["huecos", "diasLibres"]);
  assert.deepEqual(resultado.horariosNivelAlcanzado.map(llave), ["A-1+B-1"]);
});

test("diagnóstico: un criterio que el estudiante no declaró nunca aparece como incumplido", () => {
  // Solo se declara profesor (nivel 7); franja, huecos, días libres y amigos son neutros.
  const entrada = UNA_MATERIA({}, [["G1", "A", "P1", 5, ["lunes 08:00-10:00"]]]);
  entrada.estudiante.materias[0].profesoresPreferidos = ["P2"];
  entrada.catalogo.profesores.push({ id: "P2", nombre: "Otro" });
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(resultado.nivelAlcanzado, 6);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["profesor"]);
});

test("sin ningún horario posible ni el nivel 0: nivel alcanzado -1 y solo restriccionesDuras", () => {
  // El único grupo no tiene cupos: no existe ningún horario que cumpla ni las restricciones duras.
  const entrada = UNA_MATERIA({}, [["G1", "A", "P1", 0, ["lunes 08:00-10:00"]]]);
  const { resultado } = ejecutar(entrada);
  assert.equal(resultado.estado, "SIN_HORARIO");
  assert.equal(resultado.nivelAlcanzado, -1);
  assert.deepEqual(resultado.criteriosNoCumplidos, ["restriccionesDuras"]);
  assert.deepEqual(resultado.horariosNivelAlcanzado, []);
});

test("el nivel alcanzado coincide con la fuerza bruta y el diagnóstico es consistente (150 casos)", () => {
  let sinSolucion = 0;
  for (let semilla = 1; semilla <= 150; semilla += 1) {
    const entrada = generarCaso(semilla);
    const { resultado, instancia } = ejecutar(entrada);
    if (resultado.estado !== "SIN_HORARIO") continue;
    sinSolucion += 1;

    const todas = [...combinaciones(instancia)];
    let k = -1;
    for (let nivel = 0; nivel <= 8; nivel += 1) {
      if (todas.some((sel) => cumpleNivel(nivel, sel, instancia))) k = nivel;
    }
    assert.equal(resultado.nivelAlcanzado, k, `semilla ${semilla}: nivel alcanzado`);

    const delNivel = k >= 0 ? todas.filter((sel) => cumpleNivel(k, sel, instancia)) : [];
    assert.deepEqual(
      resultado.horariosNivelAlcanzado.map(llave).sort(),
      llaves(delNivel),
      `semilla ${semilla}: horarios del nivel alcanzado`,
    );

    // El primero de los no cumplidos es el nivel siguiente; los demás, ningún horario del nivel los cumple solos.
    assert.equal(resultado.criteriosNoCumplidos[0], NOMBRE_DE_NIVEL[k + 1], `semilla ${semilla}: bloqueo`);
    for (const nombre of resultado.criteriosNoCumplidos.slice(1)) {
      const nivel = NOMBRE_DE_NIVEL.indexOf(nombre);
      assert.ok(nivel > k + 1);
      assert.ok(!delNivel.some((sel) => cumpleSoloNivel(nivel, sel, instancia)), `semilla ${semilla}: ${nombre}`);
    }
  }
  assert.ok(sinSolucion > 10, `solo ${sinSolucion} casos sin solución`);
});

test("validar un archivo NO ejecuta el algoritmo (aunque ejecutarlo tardaría una eternidad)", () => {
  // 10 materias × 5 grupos sin cruces: más de 60 millones de combinaciones si se ejecutara.
  const texto = JSON.stringify(generarCasoSinCruces(10, 5, "media"));
  const inicio = Date.now();
  assert.deepEqual(validarArchivo(texto).errores, []);
  assert.deepEqual(validarArchivo(JSON.parse(texto)).errores, []);
  assert.ok(Date.now() - inicio < 2000, "validar tardó demasiado: parece que ejecutó la búsqueda");
  // Y sigue devolviendo los errores de un archivo mal formado o inválido.
  assert.equal(validarArchivo("{ no es json").errores[0].codigo, "JSON_MAL_FORMADO");
  assert.equal(validarArchivo(casoConVariosErrores()).errores.length > 1, true);
});

test("coincidencias con amigos: se calculan por grupo con conjuntos y cuadran con el conteo directo", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"], ["F1", "F2", "X"]],
      ["B-1", "B", "P1", 5, ["martes 08:00-10:00"], []],
    ],
    perfil: {
      amigos: ["F1", "F2", "F3"],
      minCoincidenciasAmigos: 2,
      materias: [["A", "alta"], ["B", "media"]],
    },
  });
  const inst = instanciaDe(entrada);
  assert.equal(inst.coincidenciasAmigosPorGrupo.get("A-1"), 2); // F1 y F2 (X no es amigo, F3 no está)
  assert.equal(inst.coincidenciasAmigosPorGrupo.get("B-1"), 0);

  // Contra el conteo directo (el original, con listas) en muchos casos aleatorios.
  for (let semilla = 1; semilla <= 60; semilla += 1) {
    const instancia = instanciaDe(generarCaso(semilla));
    for (const grupo of instancia.catalogo.grupos) {
      const directo = instancia.estudiante.amigos.filter((a) => grupo.inscritos.includes(a)).length;
      assert.equal(instancia.coincidenciasAmigosPorGrupo.get(grupo.id), directo, `semilla ${semilla}, ${grupo.id}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Integridad de un horario guardado                                  */
/* ------------------------------------------------------------------ */

function baseParaGuardar() {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["A-2", "A", "P1", 5, ["martes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["lunes 09:00-11:00"]], // se cruza con A-1
      ["B-2", "B", "P1", 5, ["miércoles 14:00-16:00"]],
    ],
    perfil: { diasLibres: ["viernes"], materias: [["A", "alta"], ["B", "alta"]] },
  });
  const curso = (courseId, sectionId) => ({ courseId, sectionId, meetings: [] });
  return { entrada, curso };
}

test("guardar: un horario real que cumple el nivel se acepta y se reconstruye desde el catálogo", () => {
  const { entrada, curso } = baseParaGuardar();
  const r = verificarHorarioGuardado({
    sourceJson: entrada,
    schedule: { name: "Horario 3", courses: [curso("A", "A-1"), curso("B", "B-2")], json: "x".repeat(10) },
    level: 8,
    title: "Mi horario",
  });
  assert.equal(r.ok, true);
  assert.equal(r.horario.name, "Mi horario");
  assert.equal(r.horario.id, 3);
  assert.deepEqual(r.horario.courses.map((c) => c.sectionId), ["A-1", "B-2"]);
  assert.deepEqual(r.horario.courses[0].meetings, [{ day: "1", startMinute: 480, endMinute: 600 }]);
  assert.equal(r.horario.creditosTotales, 6);
  assert.equal("json" in r.horario, false, "lo que mandó el navegador no se guarda tal cual");
});

test("guardar: se rechaza lo que no es un horario real", () => {
  const { entrada, curso } = baseParaGuardar();
  const intento = (cursos, level = 0, fuente = entrada) =>
    verificarHorarioGuardado({ sourceJson: fuente, schedule: { name: "H", courses: cursos }, level, title: "t" });

  // Un grupo que no existe, o que es de otra materia.
  assert.match(intento([curso("A", "A-9")]).error, /no existe/);
  assert.match(intento([curso("A", "B-1")]).error, /no existe/);
  // Una materia que el estudiante no pidió.
  assert.match(intento([curso("Z", "A-1")]).error, /no existe|no está/);
  // La misma materia dos veces.
  assert.match(intento([curso("A", "A-1"), curso("A", "A-2")]).error, /más de una vez/);
  // Dos grupos que se cruzan (nivel 0 incumplido).
  assert.match(intento([curso("A", "A-1"), curso("B", "B-1")], 0).error, /no cumple el nivel 0/);
  // Un horario vacío.
  assert.match(intento([]).error, /no tiene materias/);
  // Declarar un nivel que el horario no cumple: A-2 (martes) + B-2 sí cumple todo, pero un horario
  // con una sola materia alta no cumple la prioridad (nivel 1).
  assert.match(intento([curso("A", "A-1")], 1).error, /no cumple el nivel 1/);
  // Nivel fuera de rango o no entero.
  assert.match(intento([curso("A", "A-1")], 9).error, /entero de 0 a 8/);
  assert.match(intento([curso("A", "A-1")], 1.5).error, /entero de 0 a 8/);
  // Archivo de origen inválido.
  assert.match(intento([curso("A", "A-1")], 0, { catalogo: {} }).error, /no es válido/);
  // Forma del horario equivocada.
  assert.match(
    verificarHorarioGuardado({ sourceJson: entrada, schedule: null, level: 0, title: "t" }).error,
    /no tiene materias/,
  );
  assert.match(intento([{ courseId: 5, sectionId: "A-1" }]).error, /necesita su id/);
});

/* ------------------------------------------------------------------ */
/* Descargas bajo demanda                                             */
/* ------------------------------------------------------------------ */

test("la respuesta del servidor es compacta y los textos armados al pedirlos son idénticos a los del dominio", () => {
  const entrada = casoBaseValido();
  const respuesta = generarDesdeArchivo(entrada);
  assert.equal(respuesta.estado, "OK");
  assert.equal("descargas" in respuesta, false);
  // Cada horario trae solo ids de grupo, créditos y omitidas: nada de textos ni detalle repetido.
  assert.deepEqual(Object.keys(respuesta.horarios[0]).sort(), ["creditosTotales", "grupos", "id", "omitidas"]);

  const { resultado, instancia } = ejecutar(entrada);
  for (const horario of resultado.horarios.slice(0, 5)) {
    const compacto = respuesta.horarios.find((h) => h.id === horario.id);
    assert.equal(textoDeHorario("json", compacto, entrada), exportarHorarioJSON(resultado, horario));
    assert.equal(textoDeHorario("txt", compacto, entrada), exportarHorarioTXT(resultado, horario, instancia.catalogo));
    // También funciona con el detalle que dibuja la pantalla (y con los horarios ya guardados).
    const vista = vistaDeCompacto(compacto, instancia);
    assert.equal(textoDeHorario("txt", vista, entrada), exportarHorarioTXT(resultado, horario, instancia.catalogo));
  }
  assert.equal(textoDeResultado("json", respuesta, entrada), exportarJSON(resultado));
  assert.equal(textoDeResultado("txt", respuesta, entrada), exportarTXT(resultado, instancia.catalogo));
});

test("el detalle de un horario se reconstruye con el catálogo: materia, profesor y sesiones", () => {
  const entrada = caso({
    materias: [["A", 3]],
    grupos: [["A-1", "A", "P1", 5, ["lunes 08:00-10:00", "jueves 14:00-16:30"]]],
    perfil: { materias: [["A", "alta"]] },
  });
  const respuesta = generarDesdeArchivo(entrada);
  const vista = vistaDeCompacto(respuesta.horarios[0], instanciaDe(entrada));
  assert.equal(vista.name, "Horario 1");
  assert.equal(vista.creditosTotales, 3);
  assert.deepEqual(vista.materias, [
    {
      courseId: "A",
      nombre: "Materia A",
      sectionId: "A-1",
      profesor: "Prof P1",
      creditos: 3,
      meetings: [
        { day: "1", startMinute: 480, endMinute: 600 },
        { day: "4", startMinute: 840, endMinute: 990 },
      ],
    },
  ]);
  assert.deepEqual(vista.courses, [{ courseId: "A", sectionId: "A-1", meetings: vista.materias[0].meetings }]);
});

test("con todos los horarios posibles la respuesta sigue cabiendo en 4,5 MB (límite de Vercel)", () => {
  // 7 materias altas × 4 grupos sin cruces: 16.384 horarios. Con el detalle completo pesaba ~29 MB.
  const respuesta = generarDesdeArchivo(generarCasoSinCruces(7, 4, "alta"));
  assert.equal(respuesta.horarios.length, 4 ** 7);
  const mb = JSON.stringify(respuesta).length / (1024 * 1024);
  assert.ok(mb < 4.5, `la respuesta pesa ${mb.toFixed(1)} MB`);
});

test("descargas bajo demanda de un resultado SIN_HORARIO y de uno inválido", () => {
  const sin = UNA_MATERIA({ diasLibres: ["viernes"] }, [["G1", "A", "P1", 5, ["viernes 08:00-10:00"]]]);
  const respuestaSin = generarDesdeArchivo(sin);
  const dominio = ejecutar(sin);
  const validez = (h) => ({
    cumpleHastaNivel: dominio.resultado.nivelAlcanzado,
    incumplimientos: criteriosIncumplidosDe(
      h.asignaciones.map((a) => dominio.instancia.grupos.get(a.grupoId)),
      dominio.instancia,
    ),
  });
  assert.equal(textoDeResultado("json", respuestaSin, sin), exportarJSON(dominio.resultado, validez));
  assert.equal(
    textoDeResultado("txt", respuestaSin, sin),
    exportarTXT(dominio.resultado, dominio.instancia.catalogo, validez),
  );

  const invalido = casosInvalidos()[4].texto;
  const respuestaInv = generarDesdeArchivo(invalido);
  assert.equal(respuestaInv.estado, "ARCHIVO_INVALIDO");
  assert.equal(textoDeResultado("txt", respuestaInv, null), exportarTXT(ejecutar(invalido).resultado, null));
});

test("los índices del catálogo dan el mismo TXT que pasar el catálogo y se pueden reutilizar", () => {
  const { resultado, instancia } = ejecutar(casoBaseValido());
  const indice = indexarCatalogo(instancia.catalogo);
  assert.equal(exportarTXT(resultado, indice), exportarTXT(resultado, instancia.catalogo));
  const h = resultado.horarios[0];
  assert.equal(exportarHorarioTXT(resultado, h, indice), exportarHorarioTXT(resultado, h, instancia.catalogo));
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

/* ------------------------------------------------------------------ */
/* Horarios que NO cumplen todo: qué criterio y qué materia lo rompe  */
/* ------------------------------------------------------------------ */

/** Criterios incumplidos de una selección dada por ids de grupos: [criterio, detalle, responsables]. */
function incumplidos(entrada, ...ids) {
  const inst = instanciaDe(entrada);
  return criteriosIncumplidosDe(ids.map((id) => inst.grupos.get(id)), inst).map((i) => [
    i.criterio,
    i.detalle,
    i.responsables.map((r) => `${r.materiaId}/${r.grupoId}${r.sesion ? `/${r.sesion.dia}` : ""}`),
  ]);
}

test("incumplidos: un horario válido no incumple nada", () => {
  const { resultado, instancia } = ejecutar(casoBaseValido());
  for (const h of resultado.horarios) {
    const grupos = h.asignaciones.map((a) => instancia.grupos.get(a.grupoId));
    assert.deepEqual(criteriosIncumplidosDe(grupos, instancia), []);
  }
});

test("incumplidos: días libres y almuerzo señalan la materia, el grupo y la sesión", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 12:00-14:00"]],
      ["B-1", "B", "P1", 5, ["viernes 08:00-10:00"]],
    ],
    perfil: { diasLibres: ["viernes"], materias: [["A", "alta"], ["B", "alta"]] },
  });
  assert.deepEqual(incumplidos(entrada, "A-1", "B-1"), [
    ["almuerzo", "Materia A, grupo A-1, el lunes 12:00 a 14:00", ["A/A-1/lunes"]],
    ["diasLibres", "Materia B, grupo B-1, el viernes 08:00 a 10:00", ["B/B-1/viernes"]],
  ]);
});

test("incumplidos: huecos, franja, profesor, créditos y amigos", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-09:00"]],
      ["B-1", "B", "P2", 5, ["lunes 10:30-12:00"]],
    ],
    perfil: {
      creditosMin: 9,
      huecos: { tipo: "cortos", maxMinutos: 60 },
      franja: { inicio: "08:00", fin: "11:00" },
      amigos: ["E9"],
      minCoincidenciasAmigos: 1,
      materias: [["A", "alta"], ["B", "alta", ["P1"]]],
    },
  });
  assert.deepEqual(incumplidos(entrada, "A-1", "B-1"), [
    ["creditos", "6 créditos; mínimo 9", []],
    ["huecos", "90 min el lunes entre Materia A y Materia B (máximo 60 min)", ["A/A-1/lunes", "B/B-1/lunes"]],
    ["franja", "Materia B, grupo B-1, el lunes 10:30 a 12:00 (franja 08:00 a 11:00)", ["B/B-1/lunes"]],
    ["profesor", "Materia B con Prof P2, que no está en tu lista", ["B/B-1"]],
    ["amigos", "0 coincidencias de 1 pedidas", []],
  ]);
});

test("incumplidos: prioridad dice qué alta falta o qué materia se podía agregar", () => {
  const entrada = caso({
    materias: [["A", 3], ["B", 3]],
    grupos: [
      ["A-1", "A", "P1", 5, ["lunes 08:00-10:00"]],
      ["B-1", "B", "P1", 5, ["martes 08:00-10:00"]],
    ],
    perfil: { materias: [["A", "alta"], ["B", "media"]] },
  });
  assert.deepEqual(incumplidos(entrada, "B-1"), [
    ["prioridad", "falta la materia alta Materia A (A)", ["A/null"]],
  ]);
  assert.deepEqual(incumplidos(entrada, "A-1"), [
    ["prioridad", "Materia B se podía agregar (grupo B-1)", ["B/B-1"]],
  ]);
});

test("cada horario que no cumple todo trae al menos un criterio incumplido (150 casos)", () => {
  let revisados = 0;
  for (let semilla = 1; semilla <= 150; semilla += 1) {
    const { resultado, instancia } = ejecutar(generarCaso(semilla));
    if (resultado.estado !== "SIN_HORARIO") continue;
    for (const h of resultado.horariosNivelAlcanzado) {
      const grupos = h.asignaciones.map((a) => instancia.grupos.get(a.grupoId));
      const lista = criteriosIncumplidosDe(grupos, instancia);
      assert.ok(lista.length > 0, `semilla ${semilla}, horario ${h.id}`);
      // Solo criterios por encima del nivel alcanzado (los de abajo sí se cumplen).
      for (const i of lista) assert.ok(i.nivel > resultado.nivelAlcanzado, `semilla ${semilla}: ${i.criterio}`);
      revisados += 1;
    }
  }
  assert.ok(revisados > 10, `solo ${revisados} horarios revisados`);
});

test("descargas de un horario NO válido: dicen NO VÁLIDO y qué criterios no cumple", () => {
  const entrada = UNA_MATERIA({ diasLibres: ["viernes"] }, [["G1", "A", "P1", 5, ["viernes 08:00-10:00"]]]);
  const respuesta = generarDesdeArchivo(entrada);
  assert.equal(respuesta.estado, "SIN_HORARIO");
  const horario = respuesta.horariosNivelAlcanzado[0];

  const txt = textoDeHorario("txt", horario, entrada, respuesta.nivelAlcanzado);
  const lineas = txt.split("\n");
  assert.equal(lineas[1], "NO VÁLIDO: cumple hasta el nivel 5 de 8");
  assert.equal(lineas[2], "No cumple: Días libres (Materia A, grupo G1, el viernes 08:00 a 10:00)");

  const json = JSON.parse(textoDeHorario("json", horario, entrada, respuesta.nivelAlcanzado));
  assert.equal(json.validez, "NO VÁLIDO");
  assert.equal(json.cumpleHastaNivel, 5);
  assert.deepEqual(json.criteriosNoCumplidos, [
    {
      criterio: "diasLibres",
      detalle: "Materia A, grupo G1, el viernes 08:00 a 10:00",
      responsables: [{ materiaId: "A", grupoId: "G1", sesion: { dia: "viernes", inicio: "08:00", fin: "10:00" } }],
    },
  ]);
  assert.deepEqual(validezDeHorario(horario, entrada, 5).incumplimientos.map((i) => i.criterio), ["diasLibres"]);

  // La lista completa marca cada horario del nivel alcanzado.
  const todo = JSON.parse(textoDeResultado("json", respuesta, entrada));
  assert.equal(todo.horariosNivelAlcanzado[0].validez, "NO VÁLIDO");
  assert.equal(todo.horariosNivelAlcanzado[0].criteriosNoCumplidos[0].criterio, "diasLibres");
  const todoTxt = textoDeResultado("txt", respuesta, entrada);
  assert.match(todoTxt, /Horarios válidos: 0/);
  assert.match(todoTxt, /Cumple hasta el nivel 5 de 8/);
  assert.match(todoTxt, /Horario 1 \(3 créditos\) - NO VÁLIDO\n  No cumple: Días libres/);
});

test("descargas de un horario válido: igual que antes, sin marca", () => {
  const entrada = casoBaseValido();
  const respuesta = generarDesdeArchivo(entrada);
  const horario = respuesta.horarios[0];
  assert.equal(validezDeHorario(horario, entrada, 8), null);
  assert.doesNotMatch(textoDeHorario("txt", horario, entrada, 8), /NO VÁLIDO/);
  assert.equal(textoDeHorario("txt", horario, entrada, 8), textoDeHorario("txt", horario, entrada));
  assert.equal("validez" in JSON.parse(textoDeHorario("json", horario, entrada, 8)), false);
});

test("guardar: un horario NO válido se acepta con el nivel que de verdad cumple", () => {
  const entrada = UNA_MATERIA({ diasLibres: ["viernes"] }, [["G1", "A", "P1", 5, ["viernes 08:00-10:00"]]]);
  const schedule = { name: "Horario 1", courses: [{ courseId: "A", sectionId: "G1", meetings: [] }] };
  assert.equal(verificarHorarioGuardado({ sourceJson: entrada, schedule, level: 5, title: "t" }).ok, true);
  assert.match(
    verificarHorarioGuardado({ sourceJson: entrada, schedule, level: 8, title: "t" }).error,
    /no cumple el nivel 8/,
  );
});

/* ------------------------------------------------------------------ */
/* Archivos de demostración (datos/demostracion, ver su README)       */
/* ------------------------------------------------------------------ */

test("los archivos de demostración dan el resultado que dice su README", async () => {
  const { readFileSync } = await import("node:fs");
  const leer = (nombre) => readFileSync(new URL(`../datos/demostracion/${nombre}.json`, import.meta.url), "utf8");
  // [archivo, estado, nivel alcanzado, horarios válidos, horarios NO válidos, criterios no cumplidos]
  const esperados = [
    ["01-valido-un-solo-horario", "OK", 8, 1, 0, []],
    ["02-valido-varios-horarios-ordenados-por-profesor", "OK", 8, 8, 0, []],
    ["03-nivel-0-materia-alta-sin-grupos", "SIN_HORARIO", 0, 0, 1, ["prioridad"]],
    ["04-nivel-0-dos-materias-altas-se-cruzan", "SIN_HORARIO", 0, 0, 5, ["prioridad"]],
    ["05-nivel-1-no-alcanza-creditos-minimos", "SIN_HORARIO", 1, 0, 1, ["creditos"]],
    ["06-nivel-2-clase-en-hora-de-almuerzo", "SIN_HORARIO", 2, 0, 1, ["almuerzo"]],
    ["07-nivel-3-huecos-largos-entre-clases", "SIN_HORARIO", 3, 0, 1, ["huecos"]],
    ["08-nivel-4-clase-fuera-de-la-franja", "SIN_HORARIO", 4, 0, 1, ["franja"]],
    ["09-nivel-5-clase-en-dia-libre", "SIN_HORARIO", 5, 0, 1, ["diasLibres"]],
    ["10-nivel-6-profesor-preferido-no-disponible", "SIN_HORARIO", 6, 0, 1, ["profesor"]],
    ["11-nivel-7-pocas-coincidencias-con-amigos", "SIN_HORARIO", 7, 0, 1, ["amigos"]],
    ["12-materia-baja-en-dia-libre-se-omite", "OK", 8, 1, 0, []],
    ["13-media-tiene-preferencia-sobre-baja", "OK", 8, 1, 0, []],
    ["14-grupo-sin-cupos-se-usa-el-otro", "OK", 8, 1, 0, []],
    ["15-ningun-horario-posible-sin-cupos", "SIN_HORARIO", -1, 0, 0, ["restriccionesDuras"]],
    ["16-invalido-varios-errores", "ARCHIVO_INVALIDO", null, 0, 0, []],
  ];
  for (const [nombre, estado, nivel, validos, noValidos, criterios] of esperados) {
    const { resultado: r } = ejecutar(leer(nombre));
    assert.deepEqual(
      [r.estado, r.nivelAlcanzado, r.horarios.length, r.horariosNivelAlcanzado.length, r.criteriosNoCumplidos],
      [estado, nivel, validos, noValidos, criterios],
      nombre,
    );
  }
  // Casos puntuales del README.
  const sinMovil = ejecutar(leer("12-materia-baja-en-dia-libre-se-omite")).resultado.horarios[0];
  assert.deepEqual(sinMovil.omitidas, [{ materiaId: "MOV303", razones: ["tiene clase en día libre (sábado)"] }]);
  const media = ejecutar(leer("13-media-tiene-preferencia-sobre-baja")).resultado.horarios[0];
  assert.deepEqual(media.omitidas.map((o) => o.materiaId), ["MOV303"]);
  const sinCupos = ejecutar(leer("14-grupo-sin-cupos-se-usa-el-otro")).resultado.horarios[0];
  assert.ok(sinCupos.asignaciones.some((a) => a.grupoId === "ED201-02"));
  assert.equal(ejecutar(leer("16-invalido-varios-errores")).resultado.errores.length, 6);
  // Los tres botones de prueba de la app cargan copias de los archivos 02, 04 y 09.
  const publico = (nombre) => readFileSync(new URL(`../public/ejemplos/${nombre}.json`, import.meta.url), "utf8");
  assert.equal(publico("exitoso"), leer("02-valido-varios-horarios-ordenados-por-profesor"));
  assert.equal(publico("falla-nivel-0-altas-se-cruzan"), leer("04-nivel-0-dos-materias-altas-se-cruzan"));
  assert.equal(publico("llega-hasta-nivel-5"), leer("09-nivel-5-clase-en-dia-libre"));
  const ejemplo = publico("exitoso");
  const primero = ejecutar(ejemplo).resultado.horarios[0];
  assert.deepEqual(
    primero.asignaciones.map((a) => a.grupoId).sort(),
    ["ADA304-01", "ED201-01", "IA305-01", "MOV303-01", "OPT301-01", "WEB302-01"],
  );
});
