ALTER TABLE students ADD COLUMN student_number text;
--> statement-breakpoint
ALTER TABLE students ADD COLUMN class_name text;
--> statement-breakpoint
CREATE UNIQUE INDEX students_student_number_unique ON students(student_number);
