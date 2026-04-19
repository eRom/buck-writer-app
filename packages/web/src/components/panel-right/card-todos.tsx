import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ListChecks, Plus, X } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  type Todo,
  createTodo,
  deleteTodo,
  fetchTodos,
  updateTodo,
} from '@/lib/todos';

const TODOS_KEY = ['todos'] as const;

export function CardTodos() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');

  const { data: todos = [], isLoading } = useQuery({
    queryKey: TODOS_KEY,
    queryFn: fetchTodos,
    // Pas de polling : les mutations locales invalident. Pour que les todos
    // créés par le LLM apparaissent, invalider ['todos'] en fin de stream chat
    // (ou ré-ouvrir le panel pour refetch via refetchOnMount).
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: TODOS_KEY });

  const addMut = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      setDraft('');
      invalidate();
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      updateTodo(id, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: TODOS_KEY });
      const prev = qc.getQueryData<Todo[]>(TODOS_KEY);
      qc.setQueryData<Todo[]>(
        TODOS_KEY,
        (old) => old?.map((t) => (t.id === id ? { ...t, done } : t)) ?? [],
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODOS_KEY, ctx.prev);
    },
    onSettled: invalidate,
  });

  const editMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      updateTodo(id, { text }),
    onSettled: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: deleteTodo,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: TODOS_KEY });
      const prev = qc.getQueryData<Todo[]>(TODOS_KEY);
      qc.setQueryData<Todo[]>(
        TODOS_KEY,
        (old) => old?.filter((t) => t.id !== id) ?? [],
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODOS_KEY, ctx.prev);
    },
    onSettled: invalidate,
  });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v || addMut.isPending) return;
    addMut.mutate(v);
  };

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Replier' : 'Deployer'}
          className="hover-elevate rounded-md p-0.5 text-muted-foreground"
        >
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <ListChecks className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Todos</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {todos.filter((t) => !t.done).length}/{todos.length}
        </span>
      </header>

      {open && (
        <>
          <form onSubmit={onAdd} className="mb-2 flex items-center gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ajouter un todo..."
              className="flex-1 rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || addMut.isPending}
              aria-label="Ajouter"
              className="hover-elevate rounded-md border border-border bg-background/40 p-1.5 text-muted-foreground disabled:opacity-40"
            >
              <Plus className="size-3.5" />
            </button>
          </form>

          {isLoading ? (
            <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
              Chargement...
            </p>
          ) : todos.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
              Aucun todo
            </p>
          ) : (
            <ul className="space-y-0.5 font-mono text-[12px]">
              {todos.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  onToggle={(done) => toggleMut.mutate({ id: t.id, done })}
                  onEdit={(text) => editMut.mutate({ id: t.id, text })}
                  onDelete={() => deleteMut.mutate(t.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

interface RowProps {
  todo: Todo;
  onToggle: (done: boolean) => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}

function TodoRow({ todo, onToggle, onEdit, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(todo.text);

  const commit = () => {
    const v = value.trim();
    setEditing(false);
    if (v && v !== todo.text) onEdit(v);
    else setValue(todo.text);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      setValue(todo.text);
      setEditing(false);
    }
  };

  return (
    <li className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-background/60">
      <button
        type="button"
        onClick={() => onToggle(!todo.done)}
        aria-label={todo.done ? 'Marquer non fait' : 'Marquer fait'}
        className="shrink-0 select-none text-muted-foreground hover:text-foreground"
      >
        [{todo.done ? 'x' : ' '}]
      </button>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className="min-w-0 flex-1 bg-transparent focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => setEditing(true)}
          onClick={() => onToggle(!todo.done)}
          className={`min-w-0 flex-1 truncate text-left ${
            todo.done ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
          title="Double-clic pour éditer"
        >
          {todo.text}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Supprimer"
        className="shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 hover:text-destructive group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}
