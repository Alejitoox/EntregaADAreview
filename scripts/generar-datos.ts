/**
 * Escribe en `datos/sinteticos/` los archivos de entrada de ejemplo que se
 * pueden subir a la aplicación. Uso:
 *
 *   pnpm datos:generar
 *
 * Siempre produce los mismos archivos (las semillas son fijas).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  casoConVariosErrores,
  casosInvalidos,
  generarCaso,
  generarCasoSinCruces,
  type Entrada,
} from "./datos-sinteticos.ts";

const carpeta = join(dirname(fileURLToPath(import.meta.url)), "..", "datos", "sinteticos");
mkdirSync(carpeta, { recursive: true });

function escribir(nombre: string, contenido: string | Entrada): void {
  const texto = typeof contenido === "string" ? contenido : JSON.stringify(contenido, null, 2);
  writeFileSync(join(carpeta, nombre), `${texto}\n`, "utf8");
  console.log(`  ${nombre}`);
}

console.log(`Escribiendo archivos en ${carpeta}`);

// Casos válidos de distinto tamaño.
escribir("valido-pequeno.json", generarCaso(11, { materias: 4, gruposPorMateria: 2 }));
escribir("valido-mediano.json", generarCaso(7, { materias: 6, gruposPorMateria: 3 }));
escribir("valido-completo.json", generarCaso(5, { materias: 7, gruposPorMateria: 4 }));

// Sección 2.6 de la entrega 1: 7 materias × 4 grupos sin cruces.
escribir("espacio-busqueda-7x4-todas-altas.json", generarCasoSinCruces(7, 4, "alta"));
escribir("espacio-busqueda-7x4-omitibles.json", generarCasoSinCruces(7, 4, "media"));

// Un archivo inválido por código de error, y uno con varios errores.
casosInvalidos().forEach(({ codigoEsperado, texto }) =>
  escribir(`invalido-${codigoEsperado.toLowerCase().replace(/_/g, "-")}.json`, texto),
);
escribir("invalido-varios-errores.json", casoConVariosErrores());
