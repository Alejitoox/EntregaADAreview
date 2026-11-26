# Diferencias entre la aplicación (Entrega 2) y el informe (Entrega 1)

Cada sección dice qué dice el informe, qué hace la aplicación, por qué, y un **texto de
reemplazo sugerido** para la sección afectada del informe. Los números de sección y de
tabla son los del informe de la Entrega 1.

---

## 1. Maximalidad del nivel 1

**Secciones afectadas:** 2.4 (Nivel 1) y 2.5 (primer párrafo).

**Qué dice el informe.** Una materia media o baja omitida no puede tener un grupo que
se pueda agregar "sin romper el nivel 0 ni superar el máximo de créditos"; las medias
tienen preferencia sobre las bajas con esa misma condición. En 2.5: "a medida que sube
el nivel el conjunto de horarios válidos se mantiene igual o se reduce".

**Qué hace la aplicación.** Una materia omitida solo obliga a ser incluida, o a
sustituir a una baja, si el horario resultante también cumple los demás criterios en
juego: el nivel 0 y los niveles 2 a k en la versión del nivel k (2 a 8 en la versión
final).

**Por qué.** Con la regla del informe hay casos sin solución que sí la tienen. Ejemplo:
A (alta) con grupo el lunes 08:00–10:00, B (baja) cuyo único grupo es el viernes
08:00–10:00, viernes libre, créditos entre 3 y 9. El horario con solo A "no es maximal"
(B se podía agregar sin cruces ni pasar el máximo), y A + B rompe el día libre: el
resultado era SIN_HORARIO. Con la regla corregida, A sola es válida y B se omite con la
razón "tiene clase en día libre (viernes)". El ejemplo del informe (una alta, dos
medias y una baja, 3 créditos cada una, máximo 9) da el mismo resultado: alta + media +
baja no es válido.

**Consecuencia.** Los conjuntos de cada nivel ya no están anidados (en el ejemplo, en
el nivel 5 el único horario es A + B y en el nivel 6 es A sola). Lo que se conserva es
que si el nivel k tiene horarios, el k − 1 también, y eso basta para calcular el nivel
alcanzado con búsqueda binaria. El resultado final (nivel 8) no depende de esto.

**Texto de reemplazo sugerido (2.4, Nivel 1):**

> **Nivel 1. Prioridad de las materias.** Toda materia de prioridad alta está incluida
> en el horario. *Maximalidad:* si una materia media o baja quedó omitida, no puede
> existir un grupo suyo cuya adición deje un horario que cumpla el nivel 0 y los
> niveles 2 a k (en la versión del nivel k; en la versión final, los niveles 2 a 8).
> *Las medias tienen preferencia sobre las bajas:* si una materia media quedó omitida,
> no se puede cambiar ninguna materia baja incluida por un grupo de esa media dejando
> un horario que cumpla el nivel 0 y los niveles 2 a k. Así, una materia omitida solo
> obliga a entrar si incluirla no rompe otro criterio. Si no existe ningún horario con
> todas las materias altas incluidas, no hay horario. Estas reglas describen adiciones
> y sustituciones individuales; no equivalen a maximizar globalmente la cantidad de
> materias.

**Texto de reemplazo sugerido (2.5, primer párrafo):**

> El resultado es el conjunto de todos los horarios que cumplen todos los niveles (0 a
> 8). Como la maximalidad del nivel k se evalúa contra los criterios hasta k, los
> conjuntos de niveles intermedios no están necesariamente contenidos uno en otro; sí
> se cumple que, si existe algún horario del nivel k, existe alguno del nivel k − 1.

---

## 2. El resultado incluye horarios que NO son válidos

**Secciones afectadas:** 2.3 (Tablas 4 y 5), 2.5 ("Un horario que incumple cualquier
criterio no se devuelve") y TAD Resultado (Tabla 17).

**Qué dice el informe.** Solo se devuelven los horarios que cumplen todos los niveles;
con SIN_HORARIO la lista va vacía.

**Qué hace la aplicación.** `horarios` sigue teniendo solo horarios válidos, y con
SIN_HORARIO está vacía. Además, con SIN_HORARIO se informa `nivelAlcanzado` (el nivel
más alto con algún horario), `criteriosNoCumplidos` y `horariosNivelAlcanzado`: los
horarios de ese nivel, que **no son válidos**. La pantalla los muestra bajo "Horarios
que NO cumplen todos tus criterios", cada uno con la etiqueta "NO VÁLIDO" y una línea
"No cumple: …" por criterio, con la materia, el grupo o la sesión que lo rompe. En el
calendario se resalta el bloque culpable, y las descargas JSON y TXT los marcan
"NO VÁLIDO".

**Por qué.** Al estudiante le sirve ver lo más cercano a lo que pidió, y qué tendría que
cambiar. Se deja muy claro que no son válidos.

**Texto de reemplazo sugerido (2.5, último párrafo):**

> Un horario que incumple cualquier criterio no es válido y nunca aparece en
> `horarios`. Cuando el estado es SIN_HORARIO, el resultado informa además el nivel más
> alto alcanzado, los criterios no cumplidos y, aparte, los horarios de ese nivel,
> marcados como NO VÁLIDOS junto con los criterios que incumple cada uno y la materia,
> el grupo o la sesión responsable.

**Filas sugeridas para la Tabla 5:**

| Campo | Significado |
| --- | --- |
| nivelAlcanzado | Si el estado es SIN_HORARIO: nivel más alto (0 a 8) para el que existe algún horario; −1 si ninguno. |
| criteriosNoCumplidos | El criterio del nivel siguiente (el que bloquea) y los que ningún horario de ese nivel cumple. |
| horariosNivelAlcanzado | Horarios del nivel alcanzado. NO son válidos; cada uno se exporta con `validez: "NO VÁLIDO"`, `cumpleHastaNivel` y la lista de criterios que no cumple. |

**Atributos sugeridos para el TAD Resultado (Tabla 17):** `nivelAlcanzado` (entero de
−1 a 8, solo con SIN_HORARIO), `criteriosNoCumplidos` (colección de criterios) y
`horariosNivelAlcanzado` (colección de Horario, vacía si el estado es OK; sus horarios
no son válidos).

---

## 3. HorarioGuardado admite horarios que no son OK

**Secciones afectadas:** TAD HorarioGuardado (Tabla 18), operación
`GuardarHorario(idHorario)` del TAD Sistema y mockups 3.3 ("Mis horarios guardados").

**Qué dice el informe.** El horario guardado "corresponde a un resultado con estado OK".

**Qué hace la aplicación.** También se puede guardar un horario de
`horariosNivelAlcanzado`, después de confirmar en un diálogo ("Este horario no cumple
X. ¿Guardar de todos modos?"). Se guarda el nivel hasta el que cumple; el servidor
verifica que de verdad cumpla ese nivel. En "Mis horarios guardados" aparece como
"Válido" (nivel 8) o "No válido · cumple hasta nivel N".

**Texto de reemplazo sugerido (Tabla 18, fila `horario`, y nueva fila):**

| Atributo | Tipo | Descripción | Condición |
| --- | --- | --- | --- |
| horario | Horario | Horario elegido. | Proviene del último resultado: de `horarios` (válido) o de `horariosNivelAlcanzado` (no válido, guardado con confirmación). |
| nivel | numérico entero | Nivel hasta el que cumple el horario. | Entre 0 y 8; 8 significa válido. El horario cumple de verdad los niveles 0 a nivel. |

**Texto de reemplazo sugerido (GuardarHorario):**

> GuardarHorario(idHorario): operación que guarda un horario del último resultado.
> Precondición: el último resultado contiene un horario con ese id, en `horarios` o en
> `horariosNivelAlcanzado`; si es de este último, el usuario confirmó que quiere
> guardarlo aunque no sea válido. Postcondición: se agrega un horario guardado, con su
> nivel y su archivo de origen, a los del usuario.

---

## 4. La tabla de guardado es distinta

**Sección afectada:** 3.1 (Tabla 7).

**Qué dice el informe.** Una tabla `horarios_guardados (id, usuario_id, guardado_en,
horario jsonb, archivo_json jsonb)`.

**Qué hace la aplicación.** El esquema de Supabase (`database/supabase/001-esquema.sql`)
guarda el horario en `user_schedule` y registra al dueño en `schedule_participant`.
Equivalencias: `id` → `schedule_id`, `usuario_id` → `created_by_user_id`,
`guardado_en` → `created_at`, `horario` → `generated_schedule`, `archivo_json` →
`source_json`. Además tiene `title` (nombre del horario) y `algorithm_level` (nivel
hasta el que cumple). Los usuarios están en `app_user`. El esquema conserva tablas de
etapas anteriores (`catalog_dataset`, `course`, `course_section`, `section_meeting`,
`level_zero_test_case`, `schedule_section_assignment`) que la aplicación ya no llena.

**Texto de reemplazo sugerido (Tabla 7):**

| Tabla | Campos principales |
| --- | --- |
| app_user | user_id (id de Supabase Auth), full_name, email, created_at |
| user_schedule | schedule_id, created_by_user_id, title, algorithm_level (nivel hasta el que cumple; 8 = válido), generated_schedule (jsonb), source_json (jsonb), created_at |
| schedule_participant | schedule_id, user_id, role (se inserta solo el dueño, `owner`) |

---

## 5. Materia alta sin grupos en el catálogo

**Secciones afectadas:** 2.2.4 (Materias sin grupos), Tabla 5 (`motivo`) y 2.5
(segundo párrafo).

**Qué dice el informe.** Si una materia alta no tiene grupos, el sistema responde de
inmediato SIN_HORARIO e informa esa materia, sin ejecutar el algoritmo.

**Qué hace la aplicación.** El estado sigue siendo SIN_HORARIO (ningún horario puede
ser válido sin una alta), con el motivo "La materia alta X (ID) no se pudo inscribir
porque no tiene grupos en el catálogo" (si son varias, las nombra todas). Pero el
algoritmo **sí se ejecuta** con las demás materias, y los horarios encontrados se
muestran como NO VÁLIDOS en `horariosNivelAlcanzado`, con la alta omitida por "sin
grupos en el catálogo". Estrictamente cumplen solo el nivel 0, así que `nivelAlcanzado`
es 0 y `criteriosNoCumplidos` empieza por `prioridad`. Si no queda ninguna otra materia
con grupos, solo se muestra el aviso.

**Texto de reemplazo sugerido (2.2.4, viñeta "Materias sin grupos"):**

> Materias sin grupos: una materia del perfil que no tiene ningún grupo en el catálogo
> no es un error de validación. Si es de prioridad media o baja, se omite con la razón
> "sin grupos en el catálogo". Si es de prioridad alta, ningún horario puede ser válido
> y el estado es SIN_HORARIO, con un motivo que informa que esa materia no se pudo
> inscribir porque no tiene grupos en el catálogo. Aun así, el algoritmo se ejecuta con
> las demás materias y entrega esos horarios marcados como no válidos, con la materia
> alta omitida por esa razón.

---

## 6. Desempate del orden

**Secciones afectadas:** 2.3 (párrafo del orden) y TAD Resultado (`ObtenerHorarios`).

**Qué dice el informe.** "Si hay empate, se usa el id del horario."

**Qué hace la aplicación.** El id (1, 2, 3…) se asigna después de ordenar, así que no
puede usarse para ordenar. Los empates se resuelven con una llave estable formada por
los grupos del horario ordenados por materia (por ejemplo `A:A-1|B:B-2`). Después se
numeran los horarios.

**Texto de reemplazo sugerido (2.3):**

> Los horarios se ordenan por la suma de las posiciones de los profesores asignados
> dentro de las listas de preferidos (la primera opción vale 0, la segunda 1, y así),
> de menor a mayor. Si hay empate, se usa una llave estable formada por los grupos del
> horario ordenados por materia. Después del orden se numeran los horarios 1, 2, 3…

---

## 7. Razones de omisión y formato de las descargas

**Secciones afectadas:** Tabla 5 (`omitidas`) y 2.3 (formato TXT).

**Razones de omisión.** Por la nueva maximalidad, una materia también puede quedar
fuera porque meterla rompería otro criterio. Además de `supera creditosMax`,
`sin cupos`, `se cruza con X` y `sin grupos en el catálogo`, se informan (solo para
criterios declarados) `choca con el almuerzo`, `deja huecos…`, `fuera de la franja…`,
`tiene clase en día libre (…)` y `profesor no preferido`. Cada una bloquea al menos un
grupo de la materia.

**Descargas.** Un horario válido se exporta igual que en la sección 2.3. Uno no válido
agrega, en el TXT, las líneas `NO VÁLIDO: cumple hasta el nivel k de 8` y
`No cumple: <criterio> (<detalle>)`, y en el JSON los campos `validez`,
`cumpleHastaNivel` y `criteriosNoCumplidos` (criterio, detalle y responsables). El TXT
de un resultado SIN_HORARIO dice `Horarios válidos: 0`, `Cumple hasta el nivel k de 8`
y lista los horarios como `Horario n (c créditos) - NO VÁLIDO`.

**Texto sugerido para agregar al final de 2.3:**

> Cuando el estado es SIN_HORARIO, los horarios del nivel alcanzado se exportan aparte y
> cada uno indica "NO VÁLIDO", el nivel hasta el que cumple y los criterios que no
> cumple, con la materia, el grupo o la sesión responsable.

---

## 8. Pantallas y alcance

**Sección afectada:** 3.3 (Mockups y flujo de interacción) y 1.3 (Alcance).

- **Inicio.** Como dice el informe, tras iniciar sesión se llega a "Mis horarios
  guardados". Se quitó el "Panel principal" que tenía la aplicación. La navegación es
  Guardados, Subir JSON y Horarios generados (esta última cuando hay un resultado).
- **Un solo estudiante.** Se quitaron el selector "Participantes del horario", la ruta
  `/api/users` y la opción de compartir horarios, que no estaban en el alcance (1.3).
- **Eliminar horarios guardados.** Cada horario guardado tiene un ícono de basura para
  eliminarlo, previa confirmación. El informe no lo menciona; sugerencia para 3.3 y el
  TAD Sistema: "EliminarHorarioGuardado(id): Precondición: existe y pertenece al usuario
  autenticado. Postcondición: el horario deja de estar entre los guardados del usuario."
- **Solo Supabase y Vercel.** Se quitaron el modo local con Docker y los perfiles de
  demostración, que no estaban en la Tabla 6.

**Texto sugerido para agregar a 3.3 (Horarios generados y Calendario semanal):**

> Horarios generados. […] Si no hay horarios válidos, muestra "Horarios válidos: 0",
> cuántos horarios no cumplen todo y hasta qué nivel llegan, y los lista bajo el título
> "Horarios que NO cumplen todos tus criterios", cada uno con la etiqueta "NO VÁLIDO" y
> lo que incumple. Guardar uno de ellos pide confirmación.
>
> Calendario semanal. […] Si el horario no es válido, muestra un aviso con los criterios
> que no cumple y resalta las sesiones que los rompen.
