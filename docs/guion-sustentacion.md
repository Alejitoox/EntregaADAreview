# Guion de sustentación — Algoritmo de asignación de horarios estudiantiles

Análisis de Algoritmos · 2026-30 · Entrega 2

> **Para qué sirve este documento.** La sustentación es individual, así que los
> tres tenemos que poder explicar **todo** el proyecto, no solo "nuestra parte".
> Está escrito para leerse en orden, de lo más simple a lo más técnico. Si solo
> tienes 20 minutos, lee las secciones 1, 2, 3, 5 y 9.

---

## 1. La idea en 30 segundos

Un estudiante sube **un archivo JSON** con dos bloques:

- `catalogo`: las materias, los profesores y los **grupos** (cada grupo es una
  materia + un profesor + unos horarios de clase + cupos).
- `estudiante`: qué materias quiere, con qué prioridad (alta, media o baja) y qué
  preferencias tiene (créditos, huecos, franja, días libres, profesores, amigos).

El programa **valida** el archivo y, si está bien, **genera todos los horarios
posibles** (un grupo por materia) que cumplan las reglas, los ordena y los
muestra en una página web: lista, calendario semanal (lunes a sábado) y descarga
en JSON y TXT.

Si el archivo tiene errores, no genera nada: muestra **todos** los errores
juntos, con el código, la ruta del campo, qué esperaba y qué encontró.

**Frase para decir en la sustentación:**
"Es un problema de búsqueda con restricciones: elegir, para cada materia, un
grupo o ninguno, de modo que no haya cruces y se cumplan los criterios del
estudiante. Lo resolvemos con retroceso (*backtracking*) con podas."

---

## 2. El mapa del código (qué hay en cada archivo)

```
src/domain/scheduling/        ← el algoritmo (TypeScript puro, sin web ni base de datos)
  modelo.ts                   tipos y funciones básicas (sesión, grupo, horario…)
  validacion.ts               lee el JSON y reporta TODOS los errores (9 códigos)
  preprocesamiento.ts         prepara índices (grupos por materia, etc.)
  niveles.ts                  una función por nivel: ¿este horario cumple el nivel k?
  generador.ts                la búsqueda, el orden y el resultado (OK / SIN_HORARIO)
  exportar.ts                 arma el JSON y el TXT de salida
  level-zero.ts               el nivel 0 original (se conserva)

src/application/scheduling/
  ejecutar-archivo.ts         pega todo y entrega la respuesta que usa la web

app/api/generate/route.ts     la ruta HTTP: validar o generar
src/components/schedule-workspace.tsx   la interfaz (pantallas)
tests/algoritmo.test.mjs      44 pruebas, no necesitan Docker
scripts/ , datos/sinteticos/  generador de datos de prueba y los archivos generados
```

**Por qué está separado así:** el algoritmo no sabe nada de la web. Eso permite
probarlo solo (por eso las pruebas corren en menos de un segundo) y cambiar la
interfaz sin tocar las reglas. La interfaz **no repite ninguna regla**: solo dibuja
lo que le entrega el algoritmo.

Capas (de arriba hacia abajo): **Interfaz** → **API** → **Aplicación**
(`ejecutar-archivo`) → **Dominio** (el algoritmo).

---

## 3. Vocabulario que hay que dominar

| Palabra | Significa |
| --- | --- |
| **Materia** | Curso (id, nombre, créditos). |
| **Grupo** | Una oferta concreta de una materia: profesor, sesiones, cupos, inscritos. |
| **Sesión** | Un bloque de clase: día + hora de inicio + hora de fin. |
| **Horario** | Un conjunto de grupos, **a lo sumo uno por materia**. |
| **Omitida** | Materia pedida que no quedó en el horario (con la razón). |
| **Nivel** | Un criterio de calidad. Hay 9 (0 a 8) y son **acumulativos**. |
| **Cruce** | Dos sesiones del mismo día que se pisan en el tiempo. |
| **Hueco** | Tiempo libre entre dos clases consecutivas del mismo día. |
| **Maximal** | No se podía agregar nada más al horario sin romper una regla. |

Detalle importante: los intervalos son **semiabiertos**. Una clase de 8:00 a 10:00
y otra de 10:00 a 12:00 **no se cruzan** (la primera termina justo cuando empieza
la segunda). Las horas se manejan internamente como minutos desde la medianoche
(8:00 = 480).

---

## 4. Los 9 niveles, explicados fácil

Piensa en los niveles como **filtros que se van apretando**. El nivel 3 exige
cumplir el 0, el 1, el 2 y el 3. Nunca son puntajes: o se cumple o no.

| Nivel | Nombre | En una frase | Ejemplo |
| --- | --- | --- | --- |
| **0** | Restricciones duras | Sin cruces y con cupos. | Un grupo con 0 cupos nunca aparece. |
| **1** | Prioridad | Las materias **alta** van sí o sí; y no dejar fuera nada que cupiera. | Si cabe una media más, el horario sin ella no sirve. |
| **2** | Créditos | Total entre `creditosMin` y `creditosMax`. | Máximo 9 y cada materia 3 → máximo 3 materias. |
| **3** | Almuerzo | Ninguna clase entre 13:00 y 14:00. | Una clase 12:00–13:00 sí vale; 12:30–13:30 no. |
| **4** | Huecos | `ninguno` o `cortos` (hasta `maxMinutos`). | El tiempo de almuerzo no cuenta como hueco. |
| **5** | Franja | Las clases dentro de la franja del estudiante. | Franja 8:00–13:00: una clase 7:30 no vale. |
| **6** | Días libres | Ninguna clase en esos días. | Día libre = viernes → nada el viernes. |
| **7** | Profesor | Solo profesores de la lista de preferidos. | Si pidió P2 o P1, un grupo de P3 se descarta. |
| **8** | Amigos | Al menos N coincidencias con amigos. | Cada pareja (amigo, materia) en el mismo grupo suma 1. |

### El nivel 1 es el más delicado — entenderlo bien

Tiene tres partes:

1. **Toda materia alta está incluida.**
2. **Maximalidad:** si una materia (media o baja) quedó fuera, es porque **no se
   podía agregar** sin cruzarse, sin cupos o pasándose del máximo de créditos.
3. **Medias antes que bajas:** si una media quedó fuera, no puede ser que se
   pudiera poner **en lugar de una baja** que sí está.

**Ejemplo del informe:** 1 alta, 2 medias y 1 baja, 3 créditos cada una, máximo
9 créditos. Entran 3 materias. Las opciones serían alta + media + media, o alta +
media + baja. Pero alta + media + baja **no vale**: la otra media se podía poner
en lugar de la baja. Solo queda **alta + media + media**. (Esto está probado en
`tests/algoritmo.test.mjs`.)

### Valores neutros (campos omitidos)

Si el estudiante no declara un criterio, ese criterio se cumple siempre:
sin `creditosMin` → 0; sin `creditosMax` → sin tope; sin franja → todo el día; sin
huecos → indiferente; sin días libres, amigos o profesores → no filtra. El
**almuerzo (nivel 3) siempre está activo.**

---

## 5. Cómo funciona el algoritmo (la parte que más preguntan)

### 5.1 Paso 1 — Validar (`validacion.ts`)

Revisa el archivo y **acumula todos los errores** en vez de parar en el primero
(así el estudiante corrige todo de una vez). Hay 9 códigos:

| Código | Cuándo ocurre |
| --- | --- |
| `JSON_MAL_FORMADO` | El texto ni siquiera es JSON (se informa línea y columna). |
| `ESTRUCTURA_INVALIDA` | Falta un bloque completo (ej. no hay `estudiante`) o algo no es del contenedor esperado (objeto/lista). |
| `CAMPO_FALTANTE` | Falta un campo obligatorio. |
| `TIPO_INCORRECTO` | Un campo tiene el tipo equivocado (ej. texto donde va número). |
| `VALOR_NO_PERMITIDO` | El tipo es correcto pero el valor no está permitido (ej. día "domingo"). |
| `RANGO_INVALIDO` | Valor fuera de rango o incoherente (ej. `creditosMin` mayor que `creditosMax`, inicio ≥ fin, sesiones de un mismo grupo que se pisan). |
| `REFERENCIA_INEXISTENTE` | Un id apunta a algo que no existe (ej. materia que no está en el catálogo). |
| `DUPLICADO` | Un id repetido. |
| `DEPENDENCIA_FALTANTE` | Un campo exige otro que no está (ej. huecos `cortos` sin `maxMinutos`). |

Cada error trae: `codigo`, `ruta` (ej. `catalogo.grupos[0].sesiones[0].dia`),
`mensaje`, `esperado` y `encontrado`. Para no inventar errores en cadena, si una
lista del catálogo no se pudo leer no se reportan "referencias inexistentes"
contra ella.

### 5.2 Paso 2 — Preprocesar (`preprocesamiento.ts`)

Arma índices (grupos por materia, materias por id) y detecta las materias que
**no tienen ningún grupo** en el catálogo.

### 5.3 Paso 3 — Buscar (`generador.ts`, función `buscarSelecciones`)

Es **backtracking**. Imagina un árbol: en cada nivel del árbol se decide **una
materia**. Para esa materia se prueba cada grupo candidato y, si la materia no es
obligatoria, también **omitirla**.

```
buscar(materia i):
    si ya decidí todas las materias:
        si el horario (no vacío) cumple el nivel pedido → guardarlo
        volver
    para cada grupo candidato de la materia i:
        si se cruza con lo ya elegido → saltar        (nivel 0)
        si pasaría el máximo de créditos → saltar     (nivel 2)
        elegirlo, buscar(i + 1), des-elegirlo
    si la materia no es obligatoria:
        omitirla, buscar(i + 1)
```

**Podas (cortar ramas que no pueden dar solución):**

- Cruces y cupos: se descartan en cuanto aparecen.
- Créditos: se corta si ya se pasó el máximo, o si ni tomando **todas** las
  materias que faltan se llegaría al mínimo.
- Almuerzo, franja, días libres y profesor dependen de **un solo grupo**, entonces
  los grupos que no los cumplen ni se consideran candidatos.
- Prioridad (1), huecos (4) y amigos (8) dependen del horario **completo**, así que se
  comprueban al final.
- Se empieza por las materias obligatorias y las que tienen **menos candidatos**
  (si algo va a fallar, que falle pronto).

**Garantía de corrección:** `niveles.ts` define cada nivel de forma directa y
sencilla ("la referencia"). La búsqueda con podas es más rápida pero siempre
termina verificando con esas mismas funciones. Y las pruebas comparan contra
**fuerza bruta** (enumerar todas las combinaciones y filtrar): en 150 casos
aleatorios × 9 niveles dan exactamente los mismos horarios.

### 5.4 Paso 4 — Ordenar

Se ordena por la **suma de posiciones de los profesores**: el primer profesor de la
lista de preferidos vale 0, el segundo 1, etc. (menor suma = mejor). Si hay empate,
se desempata con una llave estable (así el orden es siempre el mismo). Luego se
numeran `Horario 1, 2, 3…`.

### 5.5 Paso 5 — Resultado

- **`OK`**: hay al menos un horario que cumple los 9 niveles.
- **`SIN_HORARIO`**: ninguno cumple todo. Se calcula el **nivel alcanzado** (el
  mayor nivel con al menos un horario) y los **criterios no cumplidos**. Primero se
  intenta directo el nivel 8; si no hay nada, se prueba 0, 1, 2… para ver hasta
  dónde se llega.
- **`ARCHIVO_INVALIDO`**: había errores de validación; no se ejecutó nada.

Casos especiales: si una materia **alta** no tiene grupos, se responde
`SIN_HORARIO` de inmediato. Las materias omitidas traen razones **comprobadas**:
`supera creditosMax`, `sin cupos`, `se cruza con X, Y`, `sin grupos en el catálogo`.

Cada ejecución devuelve **a lo sumo 5000 horarios**. Si hay más, se marca
`truncado` y la web avisa (así no se bloquea el navegador).

---

## 6. Complejidad (sin miedo)

- **Tamaño del espacio:** con `m` materias y `g` grupos por materia hay hasta
  `(g+1)^m` combinaciones (cada materia: uno de sus `g` grupos, u omitida).
  Con 7 materias × 4 grupos: **78 125** (78 124 sin la vacía). Si todas son
  obligatorias: **4^7 = 16 384**. Estos números están en la sección 2.6 del informe
  y las pruebas los reproducen exactamente.
- **Tiempo:** exponencial en `m` en el peor caso. Verificar un horario completo
  cuesta poco (polinomio pequeño); lo que explota es **cuántos** horarios hay.
- **¿Por qué no se puede hacer mejor?** Porque el enunciado pide **todos** los
  horarios, y puede haber `g^m` válidos (por ejemplo, 7 materias × 4 grupos sin
  cruces). Cualquier algoritmo que los liste tarda al menos eso. Las podas ayudan
  en los casos reales pero no cambian ese límite. *(No afirmamos que el problema sea
  NP-difícil: no lo demostramos.)*
- **Memoria:** `O(m)` de recursión, más los horarios que se devuelven.

---

## 7. La aplicación web

Flujo: **inicio de sesión → mis horarios guardados → subir JSON → lista de
horarios generados → calendario semanal → guardar o descargar.**

1. **Subir JSON:** al elegir el archivo se valida **de inmediato**. Si hay errores,
   se muestra el número de errores y la lista completa **agrupada por bloque**
   (`catalogo` / `estudiante` / archivo), cada uno con código, ruta, esperado y
   encontrado. Si es válido, se habilita "Ejecutar algoritmo".
2. **Horarios generados:** muestra estado, nivel alcanzado, criterios activos,
   cuántos horarios hay, y cada horario con sus créditos totales y materias
   omitidas (con la razón). Si no hay solución, muestra el motivo, los criterios no
   cumplidos y los mejores horarios del nivel alcanzado.
3. **Calendario semanal:** lunes a sábado, un bloque por sesión con materia, grupo
   y profesor.
4. **Guardar / descargar:** cada horario se puede guardar y descargar en JSON o TXT;
   también se puede descargar **todo el resultado**.

**Formatos de salida** (sección 2.3 del informe): el JSON trae `estudianteId`,
`estado`, `criteriosActivos`, `motivo` y la lista de `horarios` (con `materias`,
`omitidas` y `creditosTotales`). El TXT empieza con `HORARIOS PARA <id>`,
`Estado`, `Criterios activos`, `Total de horarios` y luego cada horario.

---

## 8. Decisiones que tomamos (y cómo defenderlas)

Estas son interpretaciones donde el enunciado dejaba espacio. Hay que conocerlas
para no caer si preguntan "¿y por qué así?".

1. **El horario vacío no cuenta.** Sin materias no hay horario; nunca se devuelve.
2. **Maximalidad y "medias antes que bajas"** (nivel 1): las implementamos como en
   el ejemplo del informe. Es nuestra lectura de esa sección.
3. **Los niveles son filtros, no puntajes.** El único "puntaje" es el orden por
   profesor, que solo ordena, no filtra.
4. **Dos formas de reportar "sin horario".** El informe dice "o cumple los 9 niveles
   o `SIN_HORARIO`", y las pantallas hablan de "nivel alcanzado" y "criterios no
   cumplidos". Hicimos **ambas cosas**: el estado es `SIN_HORARIO` y además se informa
   hasta qué nivel se llegó.
5. **`criteriosNoCumplidos`** lista los niveles por encima del alcanzado; el primero
   es el que realmente bloqueó, los demás ya no se pudieron verificar.
6. **Hora estricta `HH:MM`** (dos dígitos) en el archivo de entrada; internamente
   minutos. `inscritos` es opcional; `semestre` es obligatorio.
7. **Una materia con sesiones que se pisan dentro del mismo grupo** es un archivo
   inválido (`RANGO_INVALIDO`), no se "arregla" en silencio.
8. **Tope de 5000 horarios** por ejecución, para proteger al navegador (se avisa).

**Límites actuales (decirlos con honestidad):**

- El acceso con correo y contraseña **no está implementado**: hay un selector de
  usuarios de prueba. El informe contemplaba autenticación real; eso queda como
  trabajo futuro.
- La base de datos del repositorio es **PostgreSQL local** (con Docker), no
  Supabase como decía el diseño de la Entrega 1.
- El algoritmo y la API están probados automáticamente; la interfaz se compiló
  (`next build`) pero conviene recorrerla a mano antes de la sustentación.

---

## 9. Preguntas probables y respuestas cortas

**¿Qué técnica usan y por qué?**
Backtracking con podas. El problema es elegir un grupo (u omitir) por materia
respetando restricciones, y hay que listar **todas** las soluciones; backtracking
recorre el espacio una sola vez y corta las ramas que ya no pueden funcionar.

**¿Cuál es la complejidad?**
Exponencial en el número de materias: hasta `(g+1)^m` combinaciones. Es inevitable
porque la salida misma puede tener `g^m` horarios. Las podas bajan el trabajo real,
no el peor caso.

**¿Cómo saben que es correcto?**
Cada nivel está escrito como una función simple de referencia, y las pruebas
comparan la búsqueda con podas contra fuerza bruta en 150 instancias aleatorias en
los 9 niveles (1 350 comparaciones), además de casos hechos a mano con los bordes.

**¿Qué pasa si el archivo está mal?**
No se ejecuta nada. Se devuelven **todos** los errores (no solo el primero), cada
uno con código, ruta, qué se esperaba y qué se encontró.

**¿Qué pasa si no existe ningún horario?**
Estado `SIN_HORARIO` con el motivo, el nivel alcanzado, los criterios no cumplidos
y los mejores horarios hasta ese nivel.

**¿Qué diferencia hay entre alta, media y baja?**
Alta: obligatoria. Media y baja: se pueden omitir, pero solo si de verdad no cabían;
y una media tiene preferencia sobre una baja.

**¿Por qué una clase que termina a las 10:00 y otra que empieza a las 10:00 no se cruzan?**
Porque los intervalos son semiabiertos `[inicio, fin)`. El minuto 10:00 pertenece a
la segunda, no a la primera.

**¿Cómo se calculan los huecos?**
Para cada día se ordenan las sesiones por hora y se mide el tiempo libre entre cada
par consecutivo; a eso se le restan los minutos que caen dentro del almuerzo
(13:00–14:00). `ninguno` exige 0; `cortos` exige ≤ `maxMinutos`.

**¿Cómo se ordena?**
Por la suma de posiciones de los profesores preferidos (primero = 0). Empates por
una llave estable.

**¿Por qué TypeScript y Next.js?**
Un solo lenguaje para el algoritmo, la API y la interfaz; el algoritmo es TypeScript
puro, sin dependencias, y se prueba solo.

**¿Qué mejorarían?**
Autenticación real, base de datos en la nube, paginación de resultados enormes,
y una heurística para ordenar por más criterios (huecos, amigos) además del profesor.

---

## 10. Guion de demostración (5 minutos)

Los archivos de ejemplo están en `datos/sinteticos/` (los genera
`pnpm datos:generar`).

1. **Archivo con errores:** subir `invalido-varios-errores.json`. Mostrar el
   número de errores, los grupos `catalogo` / `estudiante` y un error con su ruta,
   esperado y encontrado.
2. **Un error de JSON:** subir `invalido-json-mal-formado.json`. Mostrar que
   indica línea y columna.
3. **Archivo válido:** subir `valido-completo.json` (tiene prioridades, profesores
   preferidos, días libres y amigos). Ejecutar el algoritmo.
4. **Resultado:** señalar estado `OK`, nivel alcanzado 8, criterios activos, créditos
   de cada horario y las materias omitidas con su razón.
5. **Calendario:** abrir un horario, ver lunes a sábado con materia, grupo y profesor.
6. **Descarga:** bajar el JSON y el TXT de un horario y el resultado completo.
7. **Sin solución:** (opcional) editar `valido-pequeno.json` poniendo los seis días en
   `diasLibres` y subirlo, para mostrar `SIN_HORARIO`, el motivo y el nivel alcanzado.
8. **Pruebas:** en la terminal, `pnpm test` → 44 pruebas en verde.

**Cómo correr todo en la máquina:**

```bash
pnpm install
pnpm test            # pruebas del algoritmo (sin Docker)
pnpm datos:generar   # regenera datos/sinteticos
docker compose up -d --wait db   # PostgreSQL local (solo para guardar horarios)
pnpm dev             # la aplicación en http://localhost:3000
```

---

## 11. Reparto para estudiar (cada uno debe poder explicar todo)

Para la sustentación individual, cada integrante domina todo, pero conviene
repartir el **repaso profundo** para detectar dudas entre los tres:

| Tema | Archivos |
| --- | --- |
| Validación y errores | `validacion.ts` |
| Niveles y reglas | `niveles.ts`, sección 4 |
| Búsqueda, orden y resultado | `generador.ts`, secciones 5 y 6 |
| Web, API y exportación | `ejecutar-archivo.ts`, `exportar.ts`, `schedule-workspace.tsx` |

Ejercicio recomendado: cada uno toma un caso de `tests/algoritmo.test.mjs`, lo lee
y se lo explica a los otros dos sin mirar el código.
