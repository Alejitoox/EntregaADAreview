# Archivos para la demostración

Todos usan las mismas seis materias (15 créditos en total) y el mismo horario base:

| Materia | Créditos | Grupo base | Sesiones |
| --- | --- | --- | --- |
| Introducción a la IA (IA305) | 3 | IA305-01, Laura Gómez | martes y jueves 07:00–09:00 |
| Análisis de Algoritmos (ADA304) | 2 | ADA304-01, Andrés Castro | martes y jueves 09:00–11:00 |
| Ecuaciones Diferenciales (ED201) | 3 | ED201-01, Carlos Méndez | martes y jueves 11:00–13:00 |
| Optimización y Simulación (OPT301) | 2 | OPT301-01, Patricia Silva | viernes 14:00–17:00 |
| Desarrollo Web (WEB302) | 3 | WEB302-01, Jorge Ramírez | lunes y miércoles 16:00–18:00 |
| Computación Móvil (MOV303) | 2 | MOV303-01, Diego Torres | miércoles 18:00–21:00 |

Perfil base del estudiante E101: altas ED201, ADA304 e IA305; medias WEB302 y OPT301;
baja MOV303; entre 12 y 15 créditos; franja 07:00–21:00; sábado libre; un amigo (E230,
inscrito en Análisis de Algoritmos) con mínimo 1 coincidencia. Las clases que terminan
justo cuando empieza otra (09:00, 11:00, 18:00) no se cruzan.

Cada archivo cambia una sola cosa para mostrar un resultado. "Cumple hasta el nivel k"
quiere decir que existe un horario que cumple los niveles 0 a k y ninguno llega al
k + 1.

| Archivo | Qué cambia | Resultado esperado |
| --- | --- | --- |
| `01-valido-un-solo-horario.json` | Nada: un grupo por materia. | **OK**, 1 horario válido con las 6 materias (15 créditos). |
| `02-valido-varios-horarios-ordenados-por-profesor.json` | Grupos alternos de Ecuaciones, Algoritmos y Web, con profesores preferidos. Es el mismo archivo de "Usar JSON de ejemplo". | **OK**, 8 horarios válidos. El Horario 1 es el de los profesores preferidos (el horario base). |
| `03-nivel-0-materia-alta-sin-grupos.json` | Se pide Cálculo Vectorial como alta, pero no tiene grupos. | **SIN_HORARIO**, cumple hasta el nivel 0. Aviso "La materia alta Cálculo Vectorial (CV110) no se pudo inscribir porque no tiene grupos en el catálogo" y 1 horario NO VÁLIDO con las otras seis materias. |
| `04-nivel-0-dos-materias-altas-se-cruzan.json` | Ecuaciones (alta) pasa a 08:00–10:00 y se cruza con Introducción a la IA (alta). Solo se piden las tres altas. | **SIN_HORARIO**, cumple hasta el nivel 0. Motivo: una materia alta no cabe. 5 horarios NO VÁLIDOS (les falta una alta). |
| `05-nivel-1-no-alcanza-creditos-minimos.json` | Mínimo de 18 créditos (todas suman 15). | **SIN_HORARIO**, cumple hasta el nivel 1. No cumple: Créditos (15 créditos; mínimo 18). |
| `06-nivel-2-clase-en-hora-de-almuerzo.json` | Ecuaciones (alta) pasa a 12:00–14:00. | **SIN_HORARIO**, cumple hasta el nivel 2. No cumple: Almuerzo libre, con las sesiones de Ecuaciones resaltadas. |
| `07-nivel-3-huecos-largos-entre-clases.json` | Huecos cortos de máximo 60 min y Algoritmos (alta) pasa a 15:00–17:00. | **SIN_HORARIO**, cumple hasta el nivel 3. No cumple: Huecos (120 min el martes y el jueves). |
| `08-nivel-4-clase-fuera-de-la-franja.json` | Franja 07:00–17:00 y Desarrollo Web (16:00–18:00) pasa a alta. | **SIN_HORARIO**, cumple hasta el nivel 4. No cumple: Franja horaria (Desarrollo Web y Computación Móvil, que terminan después de las 17:00). |
| `09-nivel-5-clase-en-dia-libre.json` | Viernes libre y Optimización (solo viernes) pasa a alta. | **SIN_HORARIO**, cumple hasta el nivel 5. No cumple: Días libres (Optimización el viernes). |
| `10-nivel-6-profesor-preferido-no-disponible.json` | En Ecuaciones solo se acepta a Sofía Herrera, que no dicta ningún grupo. | **SIN_HORARIO**, cumple hasta el nivel 6. No cumple: Profesor preferido. |
| `11-nivel-7-pocas-coincidencias-con-amigos.json` | Dos amigos y mínimo 2 coincidencias; solo E230 está inscrito. | **SIN_HORARIO**, cumple hasta el nivel 7. No cumple: Amigos (1 coincidencia de 2). |
| `12-materia-baja-en-dia-libre-se-omite.json` | Computación Móvil (baja) solo se dicta el sábado, que es libre. | **OK**, 1 horario con 5 materias. Computación Móvil omitida: "tiene clase en día libre (sábado)". Muestra la maximalidad corregida: una materia omitida no obliga si meterla rompe otro criterio. |
| `13-media-tiene-preferencia-sobre-baja.json` | Máximo de 13 créditos: no caben las seis. | **OK**, 1 horario sin Computación Móvil (baja). El horario que deja fuera a Optimización (media) y mete a Computación Móvil no es válido: la media va antes que la baja. |
| `14-grupo-sin-cupos-se-usa-el-otro.json` | El grupo ED201-01 no tiene cupos; existe ED201-02 (lunes y miércoles 07:00–09:00). | **OK**, 1 horario con ED201-02. |
| `15-ningun-horario-posible-sin-cupos.json` | Ningún grupo tiene cupos. | **SIN_HORARIO**, no se alcanza ni el nivel 0 (restricciones duras). Sin horarios. |
| `16-invalido-varios-errores.json` | Día "domingo", sesión con inicio mayor que fin, grupo repetido, profesor inexistente, mínimo de créditos mayor que el máximo, prioridad "urgente". | **ARCHIVO_INVALIDO** con 6 errores, agrupados por bloque. No se ejecuta el algoritmo. |

Para usarlos: en la app, **Subir JSON → Elegir archivo** y luego **Ejecutar algoritmo**.
`pnpm test` comprueba que cada archivo siga dando el resultado de esta tabla.
