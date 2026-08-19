/**
 * PROMPT EDU ERP — personal To-do list (Home page redesign: "To do list"
 * widget). `user_todos` (migration 0031) carries standard institution-level
 * RLS only — the genuine "only my own todos" guarantee is enforced HERE, at
 * the application layer, by always filtering on the CALLER's own resolved
 * userId (never a client-supplied one), the same documented pattern this
 * codebase already uses for `notifications` (see migration 0017's comment
 * on that table) rather than a second, stricter RLS policy layered on top
 * of the institution-level one every table already has.
 */
import { z } from "zod";
import { getDbClient } from "../db/client";

export interface TodoRecord {
  id: string;
  text: string;
  is_done: boolean;
  due_date: string | null;
  created_at: string;
}

export async function listMyTodos(institutionId: string, authUserId: string, userId: string): Promise<TodoRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TodoRecord>(
      `select id, text, is_done, due_date, created_at
         from user_todos
        where user_id = $1
        order by is_done asc, coalesce(due_date, '9999-12-31') asc, created_at asc`,
      [userId]
    );
    return rows;
  });
}

const addTodoSchema = z.object({
  text: z.string().min(1).max(500),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function addTodo(
  institutionId: string, authUserId: string, userId: string,
  input: z.infer<typeof addTodoSchema>
): Promise<TodoRecord> {
  const data = addTodoSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TodoRecord>(
      `insert into user_todos (institution_id, user_id, text, due_date)
       values ($1, $2, $3, $4)
       returning id, text, is_done, due_date, created_at`,
      [institutionId, userId, data.text, data.dueDate ?? null]
    );
    return rows[0];
  });
}

export async function toggleTodo(institutionId: string, authUserId: string, userId: string, todoId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      `update user_todos set is_done = not is_done, updated_at = now() where id = $1 and user_id = $2`,
      [todoId, userId]
    );
  });
}

export async function deleteTodo(institutionId: string, authUserId: string, userId: string, todoId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(`delete from user_todos where id = $1 and user_id = $2`, [todoId, userId]);
  });
}
