CREATE TABLE app_user (
    user_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_schedule (
    schedule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id TEXT REFERENCES catalog_dataset(dataset_id),
    created_by_user_id TEXT NOT NULL REFERENCES app_user(user_id),
    title TEXT NOT NULL,
    algorithm_level SMALLINT NOT NULL DEFAULT 0 CHECK (algorithm_level >= 0),
    generated_schedule JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (schedule_id, dataset_id)
);

CREATE TABLE schedule_participant (
    schedule_id BIGINT NOT NULL REFERENCES user_schedule(schedule_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES app_user(user_id),
    role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('owner', 'participant')),
    PRIMARY KEY (schedule_id, user_id)
);

CREATE TABLE schedule_section_assignment (
    schedule_id BIGINT NOT NULL,
    user_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    PRIMARY KEY (schedule_id, user_id, dataset_id, course_id),
    FOREIGN KEY (schedule_id, user_id)
        REFERENCES schedule_participant(schedule_id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id, dataset_id)
        REFERENCES user_schedule(schedule_id, dataset_id) ON DELETE CASCADE,
    FOREIGN KEY (dataset_id, course_id, section_id)
        REFERENCES course_section(dataset_id, course_id, section_id)
);

INSERT INTO app_user (user_id, full_name, email) VALUES
    ('demo-user-1', 'Usuario de prueba 1', 'user-one@example.invalid'),
    ('demo-user-2', 'Usuario de prueba 2', 'user-two@example.invalid');

INSERT INTO user_schedule (dataset_id, created_by_user_id, title)
VALUES ('sin-cruces', 'demo-user-1', 'Horario compartido de prueba');

INSERT INTO schedule_participant (schedule_id, user_id, role)
SELECT schedule_id, 'demo-user-1', 'owner'
FROM user_schedule
WHERE title = 'Horario compartido de prueba';

INSERT INTO schedule_participant (schedule_id, user_id, role)
SELECT schedule_id, 'demo-user-2', 'participant'
FROM user_schedule
WHERE title = 'Horario compartido de prueba';

INSERT INTO schedule_section_assignment (schedule_id, user_id, dataset_id, course_id, section_id)
SELECT schedule.schedule_id, assignment.user_id, schedule.dataset_id,
       assignment.course_id, assignment.section_id
FROM user_schedule AS schedule
CROSS JOIN (VALUES
    ('demo-user-1', 'A', 'A1'),
    ('demo-user-1', 'E', 'E1'),
    ('demo-user-2', 'A', 'A2'),
    ('demo-user-2', 'E', 'E2')
) AS assignment(user_id, course_id, section_id)
WHERE schedule.title = 'Horario compartido de prueba';
