# Supabase: base de datos y login

La aplicación usa **Supabase** para el login (Supabase Auth) y para la base de datos
(PostgreSQL de Supabase), y se despliega en **Vercel**. No hay modo local con Docker:
sin las variables de Supabase la página muestra "Falta configurar Supabase".

## Cómo funciona

1. El navegador inicia sesión con `supabase-js` y recibe un **token**.
2. Cada llamada a `/api/*` manda ese token en la cabecera `Authorization`.
3. El servidor le pregunta a Supabase Auth quién es (`usuarioAutenticado`). **Nunca confía en un id que mande el navegador**: el dueño de un horario y los horarios que se listan salen siempre del token.
4. El servidor guarda y lee en PostgreSQL con `pg` (variable `DATABASE_URL`). Las tablas tienen RLS activado y sin políticas, así que la API pública de Supabase no puede leerlas ni escribirlas con la clave publishable.
5. `/api/me` crea o actualiza la fila del usuario en `app_user` (su `user_id` es el id de Supabase Auth).

## Rutas de la API

| Ruta | Qué hace |
| --- | --- |
| `GET /api/me` | El usuario de la sesión (lo registra en `app_user`). |
| `POST /api/generate` | Valida el JSON (`validateOnly`) o valida y ejecuta los niveles 0 a 8. |
| `GET /api/schedules` | Los horarios guardados del usuario de la sesión (solo los suyos). |
| `POST /api/schedules` | Guarda `{ title, level, sourceJson, schedule }`. `level` es el nivel hasta el que cumple el horario (8 = válido). El servidor vuelve a validar el archivo y comprueba que el horario cumpla de verdad ese nivel antes de guardarlo; inserta la fila en `user_schedule` y la del dueño en `schedule_participant`. |

Ya no existe `/api/users` (exponía el nombre y el correo de todos los usuarios para
compartir horarios, función que se quitó).

## Configuración

1. Crea un proyecto en [supabase.com](https://supabase.com/dashboard) y aplica `database/supabase/001-esquema.sql` (SQL Editor → pegar → Run).
2. En el proyecto: **Authentication → Providers → Email** y desactiva **Confirm email** si no quieres confirmar el correo en las pruebas (si lo dejas activo, la app avisa "revisa tu correo").
3. Crea el archivo `.env.local` (no se sube a Git) a partir de `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref-del-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave publishable del proyecto>
DATABASE_URL=<cadena de conexión del proyecto, con tu contraseña>
```

   La `DATABASE_URL` está en **Connect → Session pooler** (usa esa, funciona con IPv4). Reemplaza `[YOUR-PASSWORD]` por la contraseña de base de datos que elegiste al crear el proyecto.

4. `pnpm dev` y entra a `http://localhost:3000`.

## Seguridad

- La contraseña de la base de datos y cualquier clave de servicio **no se suben a Git** ni se ponen en variables `NEXT_PUBLIC_*`.
- Solo la URL y la clave *publishable* son públicas; por diseño de Supabase pueden estar en el navegador.
- Cada usuario solo ve sus propios horarios guardados; la API no expone datos de otros usuarios.

## Despliegue en Vercel

Define las tres variables en el proyecto de Vercel (Settings → Environment Variables) y despliega (cada push a la rama conectada despliega solo). En Vercel conviene usar como `DATABASE_URL` la cadena del **Transaction pooler** (puerto 6543), pensada para funciones serverless. Después del primer despliegue, pon la URL de Vercel en Supabase → Authentication → URL Configuration → Site URL.

## Cambio de usuario

El menú del perfil recuerda en el navegador (localStorage) las cuentas con las que se entró, solo sus tokens de sesión y nunca la contraseña, y permite cambiar con un clic o agregar otra cuenta. "Cerrar sesión" cierra solo la cuenta actual.
