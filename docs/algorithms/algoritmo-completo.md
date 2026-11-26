# Algoritmo completo (niveles 0 a 8)

Esta página describe la implementación de la Entrega 2. El nivel 0 original
(`level-zero.ts`) se conserva tal cual; el algoritmo completo vive en
`src/domain/scheduling/` y no depende de React ni de PostgreSQL.

## Flujo de una ejecución

```
texto/JSON ──► validación ──► preprocesamiento ──► búsqueda ──► orden ──► resultado ──► exportar
              (validacion)    (preprocesamiento)   (generador)  (generador) (generador)   (exportar)
```

`ejecutar(entrada)` en `generador.ts` encadena todo y **nunca lanza** por datos
inválidos: si el archivo tiene errores devuelve el estado `ARCHIVO_INVALIDO` con
la lista completa. `src/application/scheduling/ejecutar-archivo.ts` lo adapta a
lo que necesita la web (`generarDesdeArchivo`, `validarArchivo`).

| Archivo | Responsabilidad |
| --- | --- |
| `modelo.ts` | Tipos (materia, grupo, sesión, estudiante, horario, resultado), constantes (días, almuerzo 13:00–14:00) y funciones básicas sobre sesiones y grupos. |
| `validacion.ts` | Lee el JSON, acumula **todos** los errores (9 códigos) y devuelve datos normalizados con los valores neutros ya aplicados. |
| `preprocesamiento.ts` | Índices por materia y grupo; detecta materias sin grupos. |
| `niveles.ts` | Un predicado por nivel (`cumpleNivel0` … `cumpleNivel8`) y `cumpleNivel(k)`, que exige los niveles 0 a k. Es la definición de referencia del problema. |
| `generador.ts` | Búsqueda con retroceso, orden de los resultados, estados `OK` / `SIN_HORARIO` y nivel alcanzado. |
| `exportar.ts` | JSON y TXT según la sección 2.3 de la Entrega 1. |

## Los niveles

Son filtros acumulativos (no puntajes). Un criterio que el estudiante no declaró
se considera cumplido.

| Nivel | Criterio | Regla |
| --- | --- | --- |
| 0 | Restricciones duras | Sin cruces el mismo día (intervalos semiabiertos: terminar a las 10:00 y empezar a las 10:00 **no** es cruce) y todo grupo con cupos. |
| 1 | Prioridad | Todas las materias *alta* están; maximalidad: una materia omitida no se podía agregar (sin cruce, con cupos y dentro de `creditosMax`); una *media* omitida no se podía poner en lugar de una *baja* incluida. |
| 2 | Créditos | `creditosMin ≤ total ≤ creditosMax`. |
| 3 | Almuerzo | Ninguna sesión toca 13:00–14:00. |
| 4 | Huecos | Entre sesiones consecutivas del mismo día, `ninguno` = 0 min, `cortos` ≤ `maxMinutos`; los minutos dentro del almuerzo no cuentan. |
| 5 | Franja | Cada sesión empieza y termina dentro de la franja (extremos incluidos). |
| 6 | Días libres | Ninguna sesión en esos días. |
| 7 | Profesor | El profesor del grupo está en `profesoresPreferidos` (si la materia declaró lista). |
| 8 | Amigos | Parejas (amigo, materia) con el amigo inscrito en el grupo asignado ≥ `minCoincidenciasAmigos`. |

## Búsqueda

`buscarSelecciones(instancia, k)` recorre las materias una por una. Para cada
materia prueba cada grupo candidato y, si la materia no es obligatoria (alta a
partir del nivel 1), también la opción de omitirla.

Podas que se aplican mientras se construye el horario:

- nivel 0: se descarta un grupo que se cruza con los ya elegidos o sin cupos;
- nivel 2: se descarta si se pasaría `creditosMax`, o si aun tomando todas las
  materias restantes no se llegaría a `creditosMin`;
- niveles 3, 5, 6 y 7 dependen de un solo grupo, así que se filtran antes de
  empezar (los grupos que no los cumplen no son candidatos);
- niveles 1, 4 y 8 dependen del horario completo y se verifican al final con
  `cumpleNivel`.

Se ordenan primero las materias obligatorias y las que tienen menos candidatos
(falla pronto). El horario vacío nunca se devuelve.

## Resultado

- `OK`: hay al menos un horario que cumple los 9 niveles.
- `SIN_HORARIO`: ninguno cumple todo. Se informa `motivo`, `nivelAlcanzado` (el
  mayor nivel `k` con algún horario; `-1` si ni siquiera el nivel 0), `criteriosNoCumplidos`
  y los horarios de ese nivel (`horariosNivelAlcanzado`). En `criteriosNoCumplidos`
  el primero es el nivel `k+1`, que es el que bloquea; de los siguientes solo se
  informan los que **ninguno** de los horarios del nivel `k` cumple por sí solo. Los
  criterios no declarados por el estudiante nunca aparecen. Una materia alta sin
  grupos en el catálogo no impide llegar al nivel 0 (se puede armar un horario sin
  ella); lo que falla es el nivel 1 (prioridad).
  Para hallar `k` no se prueban los niveles uno por uno: como cada nivel incluye al
  anterior, "el nivel tiene horarios" es verdadero hasta cierto punto y falso después,
  y una búsqueda binaria lo encuentra con unas 3 búsquedas.
- `ARCHIVO_INVALIDO`: lista de errores `{codigo, ruta, mensaje, esperado, encontrado}`.

Orden: suma de las posiciones de los profesores asignados (primera opción = 0,
segunda = 1…); a igual suma, por una llave canónica estable. Después se numeran
`Horario 1, 2, 3…`. Cada horario omitido lleva razones comprobadas
(`supera creditosMax`, `sin cupos`, `se cruza con X, Y`, `sin grupos en el catálogo`).

Se devuelven **todos** los horarios: no hay tope. Quien llama puede pedir un límite
(parámetro opcional `limite`) y entonces `truncado = true` si había más. La respuesta
de la API es compacta (ids de grupo por horario) y el detalle y los textos de descarga
se arman en la pantalla bajo demanda, así que miles de horarios no saturan la red.

## Complejidad

Con `m` materias y a lo sumo `g` grupos por materia hay hasta `(g+1)^m`
combinaciones (cada materia: uno de sus grupos u omitida). Para `m = 7`, `g = 4`
son 78 125 (78 124 sin la vacía) y 16 384 si todas son obligatorias. Verificar un
horario completo cuesta un polinomio pequeño en `m` y en el número de sesiones.

El tiempo es exponencial en `m` en el peor caso, y no es solo un defecto del
método: el enunciado pide **todos** los horarios, y el número de horarios válidos
puede ser `g^m` (caso sin cruces de `scripts/datos-sinteticos.ts`), así que
cualquier algoritmo que los liste tarda al menos eso. Las podas reducen el
trabajo en los casos reales, pero no cambian ese límite. La memoria es `O(m)` de
recursión más los horarios devueltos.

## Pruebas

`pnpm test` (sin Docker) ejecuta `tests/algoritmo.test.mjs`:

- un caso inválido por cada código de error, más acumulación de varios errores;
- casos a mano por nivel, con los bordes (10:00 contiguo, 13:00/14:00, franja inclusiva);
- el ejemplo de prioridades del informe;
- una comparación contra **fuerza bruta** en 150 instancias aleatorias × 9 niveles
  (la búsqueda con podas debe dar exactamente los mismos horarios que enumerar
  todas las combinaciones y filtrar con `cumpleNivel`);
- los conteos de la sección 2.6 (78 124 y 16 384);
- estados, motivos, nivel alcanzado y formatos JSON/TXT.

`pnpm datos:generar` reescribe `datos/sinteticos/` (siempre los mismos archivos).
