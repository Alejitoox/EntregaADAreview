import assert from "node:assert/strict";
import test from "node:test";
import { prepareLevelZero } from "../src/application/scheduling/prepare-level-zero.ts";

const input = {
  catalogo: {
    grupos: [
      { id: "ALG-01", materiaId: "ALG", sesiones: [{ dia: "Lunes", horaInicio: "08:00", horaFin: "09:00" }] },
      { id: "ALG-02", materiaId: "ALG", sesiones: [{ dia: "Martes", horaInicio: "08:00", horaFin: "09:00" }] },
      { id: "EST-01", materiaId: "EST", sesiones: [{ dia: "Lunes", horaInicio: "08:30", horaFin: "09:30" }] },
      { id: "EST-02", materiaId: "EST", sesiones: [{ dia: "Miércoles", horaInicio: "09:00", horaFin: "10:00" }] },
    ],
  },
  estudiante: { materias: [{ materiaId: "ALG" }, { materiaId: "EST" }] },
};

test("adapta el JSON del proyecto y descarta secciones cruzadas", () => {
  const result = prepareLevelZero(input);
  assert.equal(result.truncated, false);
  assert.equal(result.schedules.length, 3);
  for (const schedule of result.schedules) {
    assert.equal(schedule.courses.length, 2);
    const meetings = schedule.courses.flatMap((course) => course.meetings);
    for (let left = 0; left < meetings.length; left += 1) {
      for (let right = left + 1; right < meetings.length; right += 1) {
        const a = meetings[left];
        const b = meetings[right];
        assert.ok(a.day !== b.day || a.endMinute <= b.startMinute || b.endMinute <= a.startMinute);
      }
    }
  }
});

test("rechaza datos incompletos y días fuera del calendario soportado", () => {
  assert.throws(() => prepareLevelZero({ catalogo: {}, estudiante: {} }), /catalogo.grupos/);
  assert.throws(() => prepareLevelZero({
    catalogo: { grupos: [{ id: "G1", materiaId: "A", sesiones: [{ dia: "Domingo", horaInicio: "08:00", horaFin: "09:00" }] }] },
    estudiante: { materias: [{ materiaId: "A" }] },
  }), /Día inválido/);
});
