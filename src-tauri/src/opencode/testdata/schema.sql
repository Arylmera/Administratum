-- OpenCode's session_v2 and session_message tables as they stand after every migration at tag v2.0.29 of
-- anomalyco/opencode (packages/core/src/database/migration/), statements copied verbatim (TS escapes removed):
--   20260804233008_loose_psylocke.ts            CREATE TABLE session_v2 and its indexes; CREATE TABLE
--                                               __new_session_message, RENAME to session_message, its indexes
--                                               (its `DROP TABLE session_message` is left out: a fresh DB has none)
--   20260811161259_execution_claim_attempts.ts  ALTER session_v2 ADD resume_attempts
--   20260819222447_session_viewed_state.ts      ALTER session_v2 ADD time_idle, time_viewed, idle_outcome
-- Earlier migrations touching these tables (slow_nightmare, session_message_projection_*, jittery_ezekiel_stane,
-- event_sourced_session_input) are superseded by loose_psylocke's rebuild; the others only DELETE or UPDATE rows.
-- (loose_psylocke's other branch, for a pre-split 2.x database, renames `session` to `session_v2` in place instead
-- of rebuilding; the columns read here and the indexes relied on are the same either way.)
-- Cross-checked against packages/core/src/session/sql.ts. Foreign keys name tables not created here: run
-- PRAGMA foreign_keys = OFF first (rusqlite's bundled SQLite turns them on).

CREATE TABLE IF NOT EXISTS `session_v2` (
  `id` text PRIMARY KEY,
  `project_id` text NOT NULL,
  `workspace_id` text,
  `parent_id` text,
  `fork_session_id` text,
  `fork_boundary` text,
  `slug` text NOT NULL,
  `directory` text NOT NULL,
  `path` text,
  `title` text,
  `version` text NOT NULL,
  `share_url` text,
  `summary_additions` integer,
  `summary_deletions` integer,
  `summary_files` integer,
  `summary_diffs` text,
  `metadata` text,
  `cost` real DEFAULT 0 NOT NULL,
  `tokens_input` integer DEFAULT 0 NOT NULL,
  `tokens_output` integer DEFAULT 0 NOT NULL,
  `tokens_reasoning` integer DEFAULT 0 NOT NULL,
  `tokens_cache_read` integer DEFAULT 0 NOT NULL,
  `tokens_cache_write` integer DEFAULT 0 NOT NULL,
  `revert` text,
  `permission` text,
  `agent` text,
  `model` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  `time_compacting` integer,
  `time_archived` integer,
  `time_suspended` integer,
  CONSTRAINT `fk_session_v2_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `__new_session_message` (
  `id` text PRIMARY KEY,
  `session_id` text NOT NULL,
  `type` text NOT NULL,
  `seq` integer NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  `data` text NOT NULL,
  CONSTRAINT `fk_session_message_session_id_session_v2_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session_v2`(`id`) ON DELETE CASCADE
);
ALTER TABLE `__new_session_message` RENAME TO `session_message`;
CREATE UNIQUE INDEX `session_message_session_seq_idx` ON `session_message` (`session_id`,`seq`);
CREATE INDEX `session_message_session_type_seq_idx` ON `session_message` (`session_id`,`type`,`seq`);
CREATE INDEX `session_message_session_time_created_id_idx` ON `session_message` (`session_id`,`time_created`,`id`);
CREATE INDEX `session_message_time_created_idx` ON `session_message` (`time_created`);
CREATE INDEX `session_v2_project_idx` ON `session_v2` (`project_id`);
CREATE INDEX `session_v2_workspace_idx` ON `session_v2` (`workspace_id`);
CREATE INDEX `session_v2_parent_idx` ON `session_v2` (`parent_id`);
CREATE INDEX `session_v2_time_suspended_idx` ON `session_v2` (`time_suspended`) WHERE "session_v2"."time_suspended" is not null;

ALTER TABLE `session_v2` ADD `resume_attempts` integer DEFAULT 0 NOT NULL;

ALTER TABLE `session_v2` ADD `time_idle` integer;
ALTER TABLE `session_v2` ADD `time_viewed` integer;
ALTER TABLE `session_v2` ADD `idle_outcome` text;
