-- Esquema para Supabase (PostgreSQL gestionado).
--
-- Es el mismo esquema de database/init/ pero:
--   * sin los datos de demostración (usuarios y horarios de prueba);
--   * `app_user.user_id` guarda el id del usuario de Supabase Auth;
--   * con RLS activado en todas las tablas y SIN políticas: la API pública de
--     Supabase (clave anon/publishable) no puede leer ni escribir nada. La
--     aplicación accede solo desde el servidor, con la cadena de conexión
--     DATABASE_URL, y ahí valida quién es el usuario con su token de Auth.

CREATE TABLE catalog_dataset (
    dataset_id TEXT PRIMARY KEY,
    dataset_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE level_zero_test_case (
    dataset_id TEXT PRIMARY KEY REFERENCES catalog_dataset(dataset_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    expected_schedule_count INTEGER NOT NULL CHECK (expected_schedule_count >= 0)
);

CREATE TABLE course (
    dataset_id TEXT NOT NULL REFERENCES catalog_dataset(dataset_id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    course_name TEXT NOT NULL,
    PRIMARY KEY (dataset_id, course_id)
);

CREATE TABLE course_section (
    dataset_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    PRIMARY KEY (dataset_id, course_id, section_id),
    FOREIGN KEY (dataset_id, course_id)
        REFERENCES course(dataset_id, course_id) ON DELETE CASCADE
);

CREATE TABLE section_meeting (
    meeting_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
    CHECK (start_minute < end_minute),
    FOREIGN KEY (dataset_id, course_id, section_id)
        REFERENCES course_section(dataset_id, course_id, section_id) ON DELETE CASCADE
);

CREATE TABLE app_user (
    -- En Supabase es el id (uuid, como texto) del usuario de Supabase Auth.
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

CREATE INDEX IF NOT EXISTS user_schedule_owner_created_idx
    ON user_schedule (created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS schedule_participant_user_idx
    ON schedule_participant (user_id, schedule_id);

ALTER TABLE catalog_dataset ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_zero_test_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE course ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_meeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_section_assignment ENABLE ROW LEVEL SECURITY;
