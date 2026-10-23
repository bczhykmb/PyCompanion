import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const students = sqliteTable('students', {
  id: text('id').primaryKey(), codeHash: text('code_hash').notNull().unique(),
  studentNumber: text('student_number').unique(), className: text('class_name'),
  spareCode: text('spare_code'),
  group: text('group_id').notNull(), config: text('config').notNull(), created: integer('created').notNull(),
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), student: text('student'),
  role: text('role').notNull(), expires: integer('expires').notNull(),
});
export const turns = sqliteTable('turns', {
  id: text('id').primaryKey(), student: text('student').notNull().references(() => students.id),
  requestId: text('request_id').notNull(), question: text('question').notNull(),
  code: text('code').notNull(), task: text('task').notNull(), answer: text('answer'),
  status: text('status').notNull(), error: text('error'), mode: text('mode').notNull(),
  created: integer('created').notNull(), completed: integer('completed'),
  promptSnapshot: text('prompt_snapshot'),
}, t => [uniqueIndex('turn_request').on(t.student, t.requestId), index('turn_student_time').on(t.student, t.created),
  index('turn_student_task_time').on(t.student, t.task, t.created),
  uniqueIndex('turn_pending').on(t.student).where(sql`${t.status} = 'pending'`)]);
export const limits = sqliteTable('limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expires: integer('expires').notNull(),
});
export const promptSettings = sqliteTable('prompt_settings', {
  group: text('group_id').primaryKey(), prompt: text('prompt').notNull(), revision: text('revision').notNull(), updated: integer('updated').notNull(),
});
export const promptRevisions = sqliteTable('prompt_revisions', {
  revision: text('revision').primaryKey(), group: text('group_id').notNull(), prompt: text('prompt').notNull(), created: integer('created').notNull(),
});
