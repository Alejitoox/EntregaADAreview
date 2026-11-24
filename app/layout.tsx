import type { Metadata } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Mis horarios",
  description: "Generación y gestión de horarios universitarios",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
