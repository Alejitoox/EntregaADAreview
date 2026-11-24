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
