# PostgreSQL local

Docker Compose levanta un PostgreSQL de desarrollo y carga tres catálogos de
prueba. Cada catálogo conserva sus cursos, secciones y sesiones; la cantidad
esperada de horarios queda en `level_zero_test_case`.

```powershell
pnpm run test:level-zero
```

La prueba inicia el contenedor si hace falta, consulta los escenarios y ejecuta
el algoritmo de dominio. El volumen `postgres_data` conserva la base local.

El esquema también registra `app_user`, `user_schedule`, `schedule_participant`
y `schedule_section_assignment`. La interfaz de desarrollo lee los usuarios de
PostgreSQL, permite elegir participantes y guarda el horario resultante y el
JSON de origen dentro de una transacción. Los dos usuarios de ejemplo usan el
dominio reservado `.invalid` y solo existen para desarrollo; el selector local
no reemplaza la autenticación real.

Si ya tienes un volumen creado con la versión previa del esquema, aplica las
migraciones pendientes una sola vez. La migración agrega el almacenamiento JSON:

```powershell
docker compose exec -T db psql -U complex_schedule -d complex_schedule -v ON_ERROR_STOP=1 -f /migrations/001-separa-catalogo-y-casos-de-prueba.sql
docker compose exec -T db psql -U complex_schedule -d complex_schedule -v ON_ERROR_STOP=1 -f /migrations/002-horarios-json-y-participantes.sql
```

Para iniciar la aplicación, copia `.env.example` a `.env.local`, inicia la base
con `docker compose up -d --wait db` y ejecuta `pnpm dev`. Las rutas
`/api/users` y `/api/schedules` conectan Next.js con PostgreSQL;
`/api/generate` ejecuta el algoritmo de nivel cero sobre el JSON cargado.
Supabase Auth se integrará en una etapa posterior.
