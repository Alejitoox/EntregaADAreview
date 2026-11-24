import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  findMeetingConflict,
  generateLevelZeroSchedules,
} from "../src/domain/scheduling/level-zero.ts";
import { generateSchedulesForUsers } from "../src/application/scheduling/generate-user-schedules.ts";

const datasetQuery = String.raw`
SELECT jsonb_agg(
    jsonb_build_object(
        'id', dataset.dataset_id,
        'description', test_case.description,
        'expectedScheduleCount', test_case.expected_schedule_count,
        'courses', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'courseId', course.course_id,
                    'sections', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', section.section_id,
                                'meetings', COALESCE((
                                    SELECT jsonb_agg(
                                        jsonb_build_object(
                                            'day', meeting.day_of_week::TEXT,
                                            'startMinute', meeting.start_minute,
                                            'endMinute', meeting.end_minute
                                        ) ORDER BY meeting.day_of_week, meeting.start_minute
                                    )
                                    FROM section_meeting AS meeting
                                    WHERE meeting.dataset_id = section.dataset_id
                                      AND meeting.course_id = section.course_id
                                      AND meeting.section_id = section.section_id
                                ), '[]'::JSONB)
                            ) ORDER BY section.section_id
                        )
                        FROM course_section AS section
                        WHERE section.dataset_id = course.dataset_id
                          AND section.course_id = course.course_id
                    )
                ) ORDER BY course.course_id
            )
            FROM course
            WHERE course.dataset_id = dataset.dataset_id
        )
    ) ORDER BY dataset.dataset_id
)::TEXT
FROM level_zero_test_case AS test_case
JOIN catalog_dataset AS dataset USING (dataset_id);
`;

const participantQuery = String.raw`
SELECT jsonb_agg(
    jsonb_build_object(
        'scheduleId', schedule.schedule_id,
        'participants', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'userId', participant.user_id,
                    'selections', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'courseId', selection.course_id,
                                'id', selection.section_id,
                                'meetings', COALESCE((
                                    SELECT jsonb_agg(
                                        jsonb_build_object(
                                            'day', meeting.day_of_week::TEXT,
                                            'startMinute', meeting.start_minute,
                                            'endMinute', meeting.end_minute
                                        ) ORDER BY meeting.day_of_week, meeting.start_minute
                                    )
                                    FROM section_meeting AS meeting
                                    WHERE meeting.dataset_id = selection.dataset_id
                                      AND meeting.course_id = selection.course_id
                                      AND meeting.section_id = selection.section_id
                                ), '[]'::JSONB)
                            ) ORDER BY selection.course_id
                        )
                        FROM schedule_section_assignment AS selection
                        WHERE selection.schedule_id = participant.schedule_id
                          AND selection.user_id = participant.user_id
                    ), '[]'::JSONB)
                ) ORDER BY participant.user_id
            )
            FROM schedule_participant AS participant
            WHERE participant.schedule_id = schedule.schedule_id
        )
    ) ORDER BY schedule.schedule_id
)::TEXT
FROM user_schedule AS schedule
WHERE schedule.title = 'Horario compartido de prueba';
`;

function queryPostgres(query) {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "complex_schedule",
      "-d",
      "complex_schedule",
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--no-align",
      "--command",
      query,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output.trim());
}

test("los escenarios de PostgreSQL cumplen la restricción dura de nivel cero", async (suite) => {
  let datasets;
  try {
    datasets = queryPostgres(datasetQuery);
  } catch (error) {
    throw new Error(
      "No se pudieron leer los escenarios de PostgreSQL. Ejecuta `pnpm test:level-zero` con Docker disponible.",
      { cause: error },
    );
  }

  assert.ok(Array.isArray(datasets) && datasets.length > 0, "PostgreSQL debe contener escenarios");

  for (const dataset of datasets) {
    await suite.test(dataset.id, () => {
      const result = generateLevelZeroSchedules(dataset.courses);

      assert.equal(result.truncated, false, "el conjunto de prueba debe caber en el límite de salida");
      assert.equal(result.schedules.length, dataset.expectedScheduleCount);
      for (const schedule of result.schedules) {
        assert.equal(schedule.length, dataset.courses.length);
        assert.equal(
          findMeetingConflict(schedule.flatMap((section) => section.meetings)),
          null,
          "ningún horario devuelto puede contener sesiones cruzadas",
        );
      }
    });
  }

  await suite.test("el horario admite varios usuarios con selecciones separadas", () => {
    const schedules = queryPostgres(participantQuery);
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].participants.length, 2);

    for (const participant of schedules[0].participants) {
      assert.equal(participant.selections.length, 2);
      assert.equal(
        findMeetingConflict(participant.selections.flatMap((section) => section.meetings)),
        null,
      );
    }
  });

  await suite.test("la aplicación calcula cada usuario por separado", () => {
    const results = generateSchedulesForUsers([
      {
        userId: "sin-opciones",
        courses: [
          {
            courseId: "A",
            sections: [{ id: "A1", meetings: [{ day: "1", startMinute: 480, endMinute: 600 }] }],
          },
          {
            courseId: "B",
            sections: [{ id: "B1", meetings: [{ day: "1", startMinute: 540, endMinute: 660 }] }],
          },
        ],
      },
      {
        userId: "con-opcion",
        courses: [
          {
            courseId: "A",
            sections: [{ id: "A1", meetings: [{ day: "1", startMinute: 480, endMinute: 540 }] }],
          },
          {
            courseId: "B",
            sections: [{ id: "B1", meetings: [{ day: "2", startMinute: 480, endMinute: 540 }] }],
          },
        ],
      },
    ]);

    assert.deepEqual(results.map(({ userId, schedules }) => [userId, schedules.length]), [
      ["sin-opciones", 0],
      ["con-opcion", 1],
    ]);
  });
});
