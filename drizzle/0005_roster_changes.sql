CREATE TABLE roster_changes (id text PRIMARY KEY NOT NULL, batch_id text NOT NULL, student text NOT NULL, old_class text NOT NULL, new_class text NOT NULL, old_group text NOT NULL, new_group text NOT NULL, old_config text NOT NULL, new_config text NOT NULL, created integer NOT NULL);
--> statement-breakpoint
ALTER TABLE turns ADD COLUMN group_snapshot text;
