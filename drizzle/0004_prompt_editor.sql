CREATE TABLE prompt_settings (group_id text PRIMARY KEY NOT NULL, prompt text NOT NULL, revision text NOT NULL, updated integer NOT NULL);
--> statement-breakpoint
CREATE TABLE prompt_revisions (revision text PRIMARY KEY NOT NULL, group_id text NOT NULL, prompt text NOT NULL, created integer NOT NULL);
--> statement-breakpoint
ALTER TABLE turns ADD COLUMN prompt_snapshot text;
