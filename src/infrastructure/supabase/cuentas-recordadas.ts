/**
 * Cuentas con las que se ha entrado en este navegador, para cambiar de usuario
 * con un clic sin volver a escribir la contraseña.
 *
 * Se guardan en localStorage (igual que la sesión normal de Supabase): el id, el
 * nombre, el correo y los tokens de la sesión. Nunca se guarda la contraseña.
 */

export type CuentaRecordada = {
  id: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

const CLAVE = "cs.cuentas-recordadas";

export function leerCuentas(): CuentaRecordada[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (c): c is CuentaRecordada =>
        !!c &&
        typeof c.id === "string" &&
        typeof c.email === "string" &&
        typeof c.accessToken === "string" &&
        typeof c.refreshToken === "string",
    );
  } catch {
    return [];
  }
}

function escribir(cuentas: CuentaRecordada[]) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(cuentas));
  } catch {
    // Sin almacenamiento disponible: el cambio rápido simplemente no se recuerda.
  }
}

/** Agrega la cuenta o actualiza sus tokens (los de refresco rotan en cada renovación). */
export function guardarCuenta(cuenta: CuentaRecordada): CuentaRecordada[] {
  const actuales = leerCuentas();
  const cuentas = actuales.some((c) => c.id === cuenta.id)
    ? actuales.map((c) => (c.id === cuenta.id ? cuenta : c))
    : [...actuales, cuenta];
  escribir(cuentas);
  return cuentas;
}

export function quitarCuenta(id: string): CuentaRecordada[] {
  const cuentas = leerCuentas().filter((c) => c.id !== id);
  escribir(cuentas);
  return cuentas;
}
