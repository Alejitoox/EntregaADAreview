# Arquitectura por capas

## Límites de cada capa

- **Presentación (`src/components`, `app/`)**: Next.js App Router muestra el
  flujo y consume rutas HTTP. No implementa reglas del algoritmo ni SQL.
- **Aplicación (`src/application`)**: `ejecutar-archivo.ts` valida el JSON,
  ejecuta el algoritmo completo (niveles 0 a 8) y entrega una respuesta
  serializable y compacta. `exportar-bajo-demanda.ts` arma en el navegador los
  textos de descarga y la validez de cada horario (qué criterios no cumple).
  `validar-horario-guardado.ts` verifica un horario antes de guardarlo.
- **Dominio (`src/domain`)**: contiene los tipos y algoritmos puros
  (`scheduling/modelo`, `validacion`, `niveles`, `generador`, `exportar`). Ver
  `docs/algorithms/algoritmo-completo.md`. No depende de React ni de la base de datos.
- **Infraestructura (`src/infrastructure/postgres`, `src/infrastructure/supabase`,
  `database/supabase`)**: el pool de PostgreSQL hacia Supabase, el esquema y la
  integración con Supabase Auth (verificación del token en el servidor, cliente del
  navegador y cuentas recordadas).

El alcance es **un solo estudiante**: el resultado (niveles 0 a 8) se calcula para el
estudiante del JSON de entrada, y cada usuario ve solo los horarios que él guardó. Cada
horario guardado conserva el horario y el JSON de origen.

## Flujo de pantallas

Inicio de sesión → **Mis horarios guardados** (es el inicio; cada horario se puede abrir,
descargar o eliminar con el ícono de basura, previa confirmación) → Subir JSON → Horarios
generados → calendario semanal → guardar o descargar. La barra muestra Guardados y
Subir JSON, y "Horarios generados" cuando ya hay un resultado.

## Relación entre usuarios y horarios

`app_user` registra los usuarios (su `user_id` es el id de Supabase Auth).
`user_schedule` registra el horario guardado (`generated_schedule`), el JSON de origen
(`source_json`), su creador y `algorithm_level`: **el nivel hasta el que cumple el
horario**. 8 significa que es válido; un valor menor significa que se guardó un horario
que NO cumple todos los criterios (la app pide confirmación antes de guardarlo y lo
muestra como "No válido · cumple hasta nivel N").

`schedule_participant` se conserva sin cambios en el esquema: la API inserta en ella
solo la fila del dueño (`role = 'owner'`) y la consulta de guardados se apoya en esa
fila. La función de compartir horarios con otros usuarios se quitó porque no está en el
alcance del informe. `schedule_section_assignment`, `catalog_dataset`, `course`,
`course_section`, `section_meeting` y `level_zero_test_case` siguen en el esquema
(no se cambian las tablas), pero la aplicación ya no las llena.

## Modo de ejecución

Solo hay un modo: **Supabase + Vercel** (ver `docs/supabase.md`). Con las variables de
Supabase hay login real (Supabase Auth) y la base de datos vive en Supabase. Sin ellas,
la página muestra "Falta configurar Supabase" y las rutas de la API responden 503. Las
rutas de servidor son las únicas que abren conexiones a PostgreSQL y siempre toman la
identidad del token, nunca de lo que envíe el navegador.
