ALTER TABLE user_schedule
    ALTER COLUMN dataset_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS algorithm_level SMALLINT NOT NULL DEFAULT 0
        CHECK (algorithm_level >= 0),
    ADD COLUMN IF NOT EXISTS generated_schedule JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS source_json JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS user_schedule_owner_created_idx
    ON user_schedule (created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS schedule_participant_user_idx
    ON schedule_participant (user_id, schedule_id);
