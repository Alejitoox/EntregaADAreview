# Arquitectura por capas

## Límites de cada capa

- **Presentación (`src/components`, `app/`)**: Next.js App Router muestra el
  flujo y consume rutas HTTP. No implementa reglas de compatibilidad ni SQL.
- **Aplicación (`src/application`)**: `ejecutar-archivo.ts` valida el JSON,
  ejecuta el algoritmo completo (niveles 0 a 8) y entrega una respuesta
  serializable con horarios, errores y textos de exportación. El código del
  nivel cero (`prepare-level-zero.ts`) se conserva.
- **Dominio (`src/domain`)**: contiene los tipos y algoritmos puros
  (`scheduling/modelo`, `validacion`, `niveles`, `generador`, `exportar`). Ver
  `docs/algorithms/algoritmo-completo.md`. No depende de React, Docker ni
  PostgreSQL.
- **Infraestructura (`src/infrastructure/postgres`, `src/infrastructure/supabase`,
  `database`)**: encapsula el pool de PostgreSQL, el esquema, las migraciones, los
  datos de desarrollo y la integración con Supabase Auth (verificación del token en
  el servidor, cliente del navegador y cuentas recordadas).

La interfaz permite seleccionar un usuario propietario y varios participantes.
El resultado (niveles 0 a 8) se calcula para el estudiante del JSON de entrada;
los participantes se asocian al horario guardado y pueden consultarlo desde su
selector local. Cada resultado conserva tanto el horario generado como el JSON
de origen para que futuras etapas puedan volver a procesarlo.

## Relación entre usuarios y horarios

`app_user` registra los usuarios (en modo Supabase, su `user_id` es el id de Supabase
Auth; en modo local, usuarios de desarrollo). `user_schedule` registra
el resultado JSON, el archivo JSON de origen, el nivel alcanzado y su creador.
`schedule_participant` permite agregar varios usuarios al horario compartido.
La API inserta el horario y sus participantes dentro de una sola transacción.
`schedule_section_assignment` se conserva para escenarios normalizados de
prueba y el trabajo futuro con selecciones independientes por participante.

Las versiones de catálogo viven en `catalog_dataset`. Los casos con cantidad
esperada de horarios viven aparte en `level_zero_test_case`, para que los datos
de verificación no formen parte del modelo de horarios de la aplicación.

La aplicación funciona en dos modos (ver `docs/supabase.md`). Con las variables de
Supabase hay **login real** (Supabase Auth) y la base de datos vive en Supabase; sin
ellas, un modo local usa PostgreSQL en Docker y usuarios de demostración. En ambos
casos la interfaz usa la API de Next.js y las rutas de servidor son las únicas que
abren conexiones PostgreSQL; en modo Supabase el servidor toma la identidad del token,
no de lo que envíe el navegador.
