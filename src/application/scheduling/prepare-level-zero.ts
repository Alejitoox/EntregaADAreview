import {
  generateLevelZeroSchedules,
  type CourseRequirement,
  type ScheduledMeeting,
} from "../../domain/scheduling/level-zero.ts";

type JsonRecord = Record<string, unknown>;

export type GeneratedSchedule = {
  name: string;
  courses: { courseId: string; sectionId: string; meetings: ScheduledMeeting[] }[];
};

export type PreparedLevelZero = {
  schedules: GeneratedSchedule[];
  truncated: boolean;
};

const dayAliases: Record<string, string> = {
  "1": "1",
  lunes: "1",
  lun: "1",
  "2": "2",
  martes: "2",
  mar: "2",
  "3": "3",
  miércoles: "3",
  miercoles: "3",
  mié: "3",
  mie: "3",
  "4": "4",
  jueves: "4",
  jue: "4",
  "5": "5",
  viernes: "5",
  vie: "5",
  "6": "6",
  sábado: "6",
  sabado: "6",
  sáb: "6",
  sab: "6",
};

/** Maps the project JSON contract into the pure level-zero scheduling domain. */
export function prepareLevelZero(input: unknown, maxSchedules = 100): PreparedLevelZero {
  const courses = readLevelZeroCourses(input);
  const result = generateLevelZeroSchedules(courses, maxSchedules);
  return {
    truncated: result.truncated,
    schedules: result.schedules.map((sections, index) => ({
      name: `Horario ${index + 1}`,
      courses: sections.map((section, sectionIndex) => ({
        courseId: courses[sectionIndex].courseId,
        sectionId: section.id,
        meetings: section.meetings,
      })),
    })),
  };
}

export function readLevelZeroCourses(input: unknown): CourseRequirement[] {
  const root = asRecord(input, "El JSON debe ser un objeto");
  const catalog = asRecord(root.catalogo, "Falta el bloque catalogo");
  const student = asRecord(root.estudiante, "Falta el bloque estudiante");
  const groups = asArray(catalog.grupos, "catalogo.grupos debe ser una lista");
  const requested = asArray(student.materias, "estudiante.materias debe ser una lista");
  if (requested.length === 0) throw new Error("El estudiante debe solicitar al menos una materia");

  return requested.map((item, index) => {
    const requirement = asRecord(item, `estudiante.materias[${index}] no es válido`);
    const courseId = readId(
      requirement.materiaId ?? requirement.id,
      `La materia ${index + 1} no tiene id`,
    );
    const matchingGroups = groups.filter((group) => {
      const record = asRecord(group, "Hay un grupo inválido en el catálogo");
      return String(record.materiaId ?? record.courseId ?? "") === courseId;
    });

    return {
      courseId,
      sections: matchingGroups.map((group, groupIndex) => {
        const record = asRecord(group, `El grupo ${groupIndex + 1} no es válido`);
        const id = readId(record.id ?? record.grupoId, `Un grupo de ${courseId} no tiene id`);
        const sessions = asArray(
          record.sesiones ?? record.meetings,
          `El grupo ${id} no tiene sesiones`,
        );
        return {
          id,
          meetings: sessions.map((rawSession, sessionIndex) => {
            const meeting = asRecord(
              rawSession,
              `La sesión ${sessionIndex + 1} del grupo ${id} no es válida`,
            );
            const session = {
              day: normalizeDay(
                meeting.dia ?? meeting.day ?? meeting.diaSemana ?? meeting.dayOfWeek,
              ),
              startMinute: normalizeTime(
                meeting.startMinute ?? meeting.horaInicio ?? meeting.inicio,
                "inicio",
              ),
              endMinute: normalizeTime(meeting.endMinute ?? meeting.horaFin ?? meeting.fin, "fin"),
            };
            if (
              session.startMinute < 0 ||
              session.endMinute > 1440 ||
              session.startMinute >= session.endMinute
            ) {
              throw new Error(`La sesión del grupo ${id} debe tener un intervalo válido.`);
            }
            return session;
          }),
        };
      }),
    };
  });
}

function asRecord(value: unknown, message: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as JsonRecord;
}

function asArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function readId(value: unknown, message: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(message);
  const id = String(value).trim();
  if (!id) throw new Error(message);
  return id;
}

function normalizeDay(value: unknown): string {
  const key = String(value ?? "")
    .trim()
    .toLocaleLowerCase("es");
  const day = dayAliases[key];
  if (!day) throw new Error(`Día inválido: ${String(value)}`);
  return day;
}

function normalizeTime(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour <= 24 && minute < 60 && (hour < 24 || minute === 0)) return hour * 60 + minute;
    }
  }
  throw new Error(`La hora de ${label} debe ser minuto entero o formato HH:mm`);
}
