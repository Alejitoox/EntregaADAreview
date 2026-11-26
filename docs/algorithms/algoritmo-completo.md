# Algoritmo completo (niveles 0 a 8)

Esta página describe la implementación de la Entrega 2. El algoritmo vive en
`src/domain/scheduling/` y no depende de React ni de PostgreSQL. Las diferencias
con el informe de la Entrega 1 están en `docs/cambios-vs-entrega1.md`.

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
| `niveles.ts` | Un predicado por nivel (`cumpleNivel0` … `cumpleNivel8`) y `cumpleNivel(k)`, que exige los niveles 0 a k. Es la definición de referencia del problema. También `criteriosIncumplidosDe` (qué criterios no cumple un horario y qué materia, grupo o sesión lo rompe) y las razones de omisión. |
| `generador.ts` | Búsqueda con retroceso, orden de los resultados, estados `OK` / `SIN_HORARIO` y nivel alcanzado. |
| `exportar.ts` | JSON y TXT según la sección 2.3 de la Entrega 1. |

## Los niveles

Son filtros acumulativos (no puntajes). Un criterio que el estudiante no declaró
se considera cumplido.

| Nivel | Criterio | Regla |
| --- | --- | --- |
| 0 | Restricciones duras | Sin cruces el mismo día (intervalos semiabiertos: terminar a las 10:00 y empezar a las 10:00 **no** es cruce) y todo grupo con cupos. |
| 1 | Prioridad | Todas las materias *alta* están; maximalidad: una materia omitida no se podía agregar dejando un horario que cumpla el nivel 0 y los niveles 2 a k; una *media* omitida no se podía poner en lugar de una *baja* incluida con esa misma condición (ver abajo). |
| 2 | Créditos | `creditosMin ≤ total ≤ creditosMax`. |
| 3 | Almuerzo | Ninguna sesión toca 13:00–14:00. |
| 4 | Huecos | Entre sesiones consecutivas del mismo día, `ninguno` = 0 min, `cortos` ≤ `maxMinutos`; los minutos dentro del almuerzo no cuentan. |
| 5 | Franja | Cada sesión empieza y termina dentro de la franja (extremos incluidos). |
| 6 | Días libres | Ninguna sesión en esos días. |
| 7 | Profesor | El profesor del grupo está en `profesoresPreferidos` (si la materia declaró lista). |
| 8 | Amigos | Parejas (amigo, materia) con el amigo inscrito en el grupo asignado ≥ `minCoincidenciasAmigos`. |

### Maximalidad del nivel 1

En la versión del nivel `k`, una materia omitida **solo obliga** a entrar (b), o a
desplazar a una baja (c), si el horario resultante también cumple el nivel 0 y los
niveles 2 a `k`. En la versión final (`k = 8`) eso es "cumple todo lo demás".

Ejemplo: A (alta) tiene grupo el lunes 08:00–10:00; B (baja) solo tiene grupo el
viernes 08:00–10:00; el estudiante pide viernes libre, `creditosMin = 3`,
`creditosMax = 9`. Meter B rompería los días libres, así que el horario con solo A es
válido (B se omite con la razón "tiene clase en día libre (viernes)"). Antes, la
maximalidad solo miraba el nivel 0 y `creditosMax`, así que A sola no valía y el
resultado era `SIN_HORARIO`.

El ejemplo del informe se mantiene: con una alta, dos medias y una baja de 3 créditos y
máximo 9, el horario alta + media + baja no es válido, porque cambiar la baja por la
otra media deja un horario que cumple todo.

**Consecuencia: los conjuntos ya no están anidados.** Con la definición anterior,
V₈ ⊆ V₇ ⊆ … ⊆ V₀. Ahora no: en el ejemplo, V₅ = {A+B} (los días libres todavía no
están en juego, así que B debe entrar) y V₆ = {A}, que no está en V₅. Lo que sí se
conserva es que **"Vₖ tiene algún horario" es monótono**: si S está en Vₖ₊₁ y no en
Vₖ, alguna materia omitida se podía agregar (o cambiar por una baja) cumpliendo los
niveles 0 y 2 a k. Haciendo ese cambio, y repitiéndolo, el par (medias incluidas,
materias incluidas) crece en cada paso, así que la cadena termina en un horario de Vₖ.
Por eso la búsqueda binaria del nivel alcanzado sigue siendo correcta. Las pruebas lo
verifican contra fuerza bruta: no vacío monótono en 150 casos, y casos concretos no
anidados.

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
  `cumpleNivel`. Ninguna poda depende de la maximalidad, así que el cambio del
  nivel 1 no afecta las podas.

Se ordenan primero las materias obligatorias y las que tienen menos candidatos
(falla pronto). El horario vacío nunca se devuelve.

## Resultado

- `OK`: hay al menos un horario que cumple los 9 niveles.
- `SIN_HORARIO`: ninguno cumple todo. Se informa `motivo`, `nivelAlcanzado` (el
  mayor nivel `k` con algún horario; `-1` si ni siquiera el nivel 0), `criteriosNoCumplidos`
  y los horarios de ese nivel (`horariosNivelAlcanzado`). En `criteriosNoCumplidos`
  el primero es el nivel `k+1`, que es el que bloquea; de los siguientes solo se
  informan los que **ninguno** de los horarios del nivel `k` cumple por sí solo. Los
  criterios no declarados por el estudiante nunca aparecen.
  Para hallar `k` no se prueban los niveles uno por uno: "el nivel tiene horarios" es
  verdadero hasta cierto punto y falso después (ver la maximalidad del nivel 1), y una
  búsqueda binaria lo encuentra con unas 3 búsquedas.
- **Los horarios de `horariosNivelAlcanzado` NO son válidos.** La pantalla los muestra
  bajo "Horarios que NO cumplen todos tus criterios", cada uno con la etiqueta
  "NO VÁLIDO" y una línea "No cumple: …" por criterio, calculada con
  `criteriosIncumplidosDe` (criterio, detalle y responsables: materia, grupo y sesión).
  En el calendario se resaltan las sesiones responsables. Se pueden guardar después
  de confirmar, con `algorithm_level` = nivel alcanzado. Las descargas JSON y TXT los
  marcan "NO VÁLIDO" con los criterios que no cumplen.
- **Materia alta sin grupos en el catálogo.** No se puede inscribir, así que ningún
  horario es válido: el estado es `SIN_HORARIO` y el motivo dice "La materia alta X
  (ID) no se pudo inscribir porque no tiene grupos en el catálogo" (si son varias, las
  nombra todas). Aun así se busca con las demás materias y los horarios encontrados
  van en `horariosNivelAlcanzado`, con la alta omitida por "sin grupos en el catálogo".
  Estrictamente cumplen solo el nivel 0 (sin una alta no se pasa la prioridad), así
  que `nivelAlcanzado` es 0 y `criteriosNoCumplidos` empieza por `prioridad` y sigue
  con lo que las demás materias tampoco cumplen. Si no queda ninguna otra materia con
  grupos, no hay horarios y solo se muestra el aviso.
- `ARCHIVO_INVALIDO`: lista de errores `{codigo, ruta, mensaje, esperado, encontrado}`.

Orden: suma de las posiciones de los profesores asignados (primera opción = 0,
segunda = 1…); a igual suma, por una llave canónica estable. Después se numeran
`Horario 1, 2, 3…` (el informe dice "por id del horario", pero ese id se asigna
después de ordenar, así que no puede ser el desempate). Cada materia omitida lleva
razones comprobadas: `supera creditosMax`, `sin cupos`, `se cruza con X, Y`,
`sin grupos en el catálogo` y, para los criterios que el estudiante declaró,
`choca con el almuerzo`, `deja huecos…`, `fuera de la franja…`,
`tiene clase en día libre (…)` y `profesor no preferido`. Cada razón bloquea al menos
un grupo de la materia.

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

`pnpm test` (sin base de datos) ejecuta `tests/algoritmo.test.mjs`:

- un caso inválido por cada código de error, más acumulación de varios errores;
- casos a mano por nivel, con los bordes (10:00 contiguo, 13:00/14:00, franja inclusiva);
- el ejemplo de prioridades del informe (también en la versión final);
- la maximalidad del nivel 1: el caso del viernes libre da `OK` con solo A, una
  media que rompe un criterio no desplaza a la baja, y los niveles 5 y 6 no están anidados;
- materia alta sin grupos: se busca con las demás, los horarios no son válidos y, si
  no queda otra materia, solo el aviso;
- una comparación contra **fuerza bruta** en 150 instancias aleatorias × 9 niveles
  (la búsqueda con podas debe dar exactamente los mismos horarios que enumerar
  todas las combinaciones y filtrar con `cumpleNivel`), más la propiedad de no vacío
  monótono que usa la búsqueda binaria;
- `criteriosIncumplidosDe` por criterio (días libres, almuerzo, huecos, franja,
  profesor, créditos, amigos y prioridad) y en 150 casos aleatorios;
- descargas de un horario no válido (marca "NO VÁLIDO") y de uno válido (sin cambios);
- los conteos de la sección 2.6 (78 124 y 16 384);
- estados, motivos, nivel alcanzado y formatos JSON/TXT.

`pnpm datos:generar` reescribe `datos/sinteticos/` (siempre los mismos archivos).
