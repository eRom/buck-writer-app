import { apiFetch } from './api';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export async function fetchTodos(): Promise<Todo[]> {
  const res = await apiFetch<{ todos: Todo[] }>('/api/todos');
  return res.todos;
}

export async function createTodo(text: string): Promise<Todo> {
  const res = await apiFetch<{ todo: Todo }>('/api/todos', {
    method: 'POST',
    body: { text },
  });
  return res.todo;
}

export async function updateTodo(
  id: string,
  patch: { text?: string; done?: boolean },
): Promise<Todo> {
  const res = await apiFetch<{ todo: Todo }>(`/api/todos/${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return res.todo;
}

export async function deleteTodo(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/todos/${id}`, { method: 'DELETE' });
}
