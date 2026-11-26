/**
 * Configuración de Supabase Auth. Las dos variables son públicas (van al
 * navegador): la URL del proyecto y la clave *publishable* (o anon). Nunca se
 * pone aquí la clave de servicio ni la contraseña de la base de datos.
 *
 * Son obligatorias: si faltan, la aplicación muestra un aviso de configuración y
 * las rutas de la API responden 503. No hay modo local sin Supabase.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const authEnabled = supabaseUrl !== "" && supabaseKey !== "";
