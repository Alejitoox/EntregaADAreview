BEGIN;

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

INSERT INTO catalog_dataset (dataset_id, dataset_name)
SELECT dataset_id, dataset_id FROM schedule_dataset;

INSERT INTO level_zero_test_case (dataset_id, description, expected_schedule_count)
SELECT dataset_id, description, expected_schedule_count FROM schedule_dataset;

ALTER TABLE course DROP CONSTRAINT course_dataset_id_fkey;
ALTER TABLE course
    ADD CONSTRAINT course_dataset_id_fkey
    FOREIGN KEY (dataset_id) REFERENCES catalog_dataset(dataset_id) ON DELETE CASCADE;

ALTER TABLE user_schedule DROP CONSTRAINT user_schedule_dataset_id_fkey;
ALTER TABLE user_schedule
    ADD CONSTRAINT user_schedule_dataset_id_fkey
    FOREIGN KEY (dataset_id) REFERENCES catalog_dataset(dataset_id);

DROP TABLE schedule_dataset;

COMMIT;
