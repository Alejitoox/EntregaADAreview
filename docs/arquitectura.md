# Arquitectura por capas

## Límites de cada capa

- **Presentación (`src/App.tsx`)**: recibe acciones y muestra horarios. No
  implementa reglas de compatibilidad ni consultas SQL.
- **Aplicación (`src/application`)**: coordina casos de uso, como generar
  horarios para varios usuarios.
- **Dominio (`src/domain`)**: contiene los tipos y algoritmos puros de
  restricciones. No depende de React, Docker ni PostgreSQL.
- **Infraestructura (`database`)**: define el esquema y los datos locales de
  PostgreSQL en Docker.

La capa de aplicación ejecuta el algoritmo de dominio de forma independiente
para cada usuario seleccionado. Así, los traslapes se revisan en el horario de
cada persona; los horarios de dos usuarios distintos no generan conflictos
entre sí.

## Relación entre usuarios y horarios

`app_user` registra las cuentas de la aplicación. `user_schedule` registra el
horario compartible y su creador. `schedule_participant` permite agregar varios
usuarios al mismo horario. `schedule_section_assignment` guarda la sección
elegida por usuario y por curso, de modo que cada participante conserva su
propio resultado dentro del horario compartido.

Las versiones de catálogo viven en `catalog_dataset`. Los casos con cantidad
esperada de horarios viven aparte en `level_zero_test_case`, para que los datos
de verificación no formen parte del modelo de horarios de la aplicación.

El esquema y los dos usuarios de ejemplo son locales para desarrollo. La
integración de autenticación, API y persistencia de la interfaz se conectará en
una capa de infraestructura posterior; el navegador no se conecta directamente
a PostgreSQL.
