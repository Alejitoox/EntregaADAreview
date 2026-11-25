/**
 * Configuración de Supabase Auth. Las dos variables son públicas (van al
 * navegador): la URL del proyecto y la clave *publishable* (o anon). Nunca se
 * pone aquí la clave de servicio ni la contraseña de la base de datos.
 *
 * Si no están definidas, la aplicación funciona en "modo local": sin login real,
 * con el selector de usuarios de demostración y PostgreSQL local.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const authEnabled = supabaseUrl !== "" && supabaseKey !== "";
