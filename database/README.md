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
y `schedule_section_assignment`. Un horario puede incluir a varios usuarios y
cada persona conserva una sección por curso. Los dos usuarios de ejemplo usan
el dominio reservado `.invalid` y solo existen para desarrollo.

Si ya tienes un volumen creado con la versión previa del esquema, aplica una
sola vez la migración antes de correr la prueba:

```powershell
docker compose exec -T db psql -U complex_schedule -d complex_schedule -v ON_ERROR_STOP=1 -f /migrations/001-separa-catalogo-y-casos-de-prueba.sql
```
