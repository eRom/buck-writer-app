import { useEffect, useRef, useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  Brain,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Pencil,
  Download,
  Trash2,
  FilePlus,
  FolderPlus,
} from 'lucide-react';
import type { FileEntry } from '@buck/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { InlineConfirm } from './inline-confirm';

export type CreatingState = {
  parentPath: string;
  kind: 'file' | 'directory';
} | null;

export interface FileTreeActions {
  rename: (path: string, newName: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  uploadInto: (dirPath: string, files: FileList) => Promise<void>;
  requestCreate: (parentPath: string, kind: 'file' | 'directory') => void;
  submitCreate: (name: string) => Promise<void>;
  cancelCreate: () => void;
}

interface FileTreeProps {
  entries: FileEntry[];
  creating: CreatingState;
  actions: FileTreeActions;
  onSelect?: (entry: FileEntry) => void;
  onInsertReference?: (path: string) => void;
}

function entryIcon(entry: FileEntry, expanded: boolean) {
  if (entry.type === 'directory') {
    if (entry.name === 'knowledge') {
      return { Icon: Brain, className: 'text-amber-500' };
    }
    return { Icon: expanded ? FolderOpen : Folder, className: 'text-foreground' };
  }
  return { Icon: FileText, className: 'text-muted-foreground' };
}

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  creating: CreatingState;
  actions: FileTreeActions;
  onSelect?: (entry: FileEntry) => void;
  onInsertReference?: (path: string) => void;
}

function FileTreeItem({
  entry,
  depth,
  creating,
  actions,
  onSelect,
  onInsertReference,
}: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragCounter = useRef(0);

  const isDir = entry.type === 'directory';
  const indent = depth * 12;
  const { Icon, className: iconClass } = entryIcon(entry, expanded);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  // When the parent requests creation inside this dir, ensure it's expanded.
  useEffect(() => {
    if (creating?.parentPath === entry.path && !expanded) setExpanded(true);
  }, [creating, entry.path, expanded]);

  async function handleRenameSubmit(newName: string) {
    if (!newName.trim() || newName === entry.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await actions.rename(entry.path, newName.trim());
      setRenaming(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await actions.remove(entry.path);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    const url = `/api/workspace/file?path=${encodeURIComponent(entry.path)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDropTarget(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDropTarget(false);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDropTarget(false);
    if (e.dataTransfer.files.length > 0) {
      if (!expanded) setExpanded(true);
      await actions.uploadInto(entry.path, e.dataTransfer.files);
    }
  }

  if (confirmDelete) {
    return (
      <div style={{ paddingLeft: `${indent + 4}px` }} className="my-0.5">
        <InlineConfirm
          message={`Supprimer «${entry.name}»${isDir ? ' et son contenu' : ''} ?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          busy={busy}
        />
      </div>
    );
  }

  if (renaming) {
    return (
      <RenameRow
        initial={entry.name}
        depth={depth}
        Icon={Icon}
        iconClass={iconClass}
        onSubmit={handleRenameSubmit}
        onCancel={() => setRenaming(false)}
        busy={busy}
      />
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          'group flex items-center gap-1 rounded px-1 py-0.5 text-xs',
          isDropTarget && 'bg-primary/10 ring-1 ring-primary/40',
          !isDropTarget && 'hover:bg-accent',
        )}
        style={{ paddingLeft: `${indent + 4}px` }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => {
            if (isDir) setExpanded(!expanded);
            else onSelect?.(entry);
          }}
          onDoubleClick={() => {
            if (!isDir) onInsertReference?.(entry.path);
          }}
        >
          {isDir ? (
            <Chevron className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <Icon className={cn('size-3.5 shrink-0', iconClass)} />
          <span
            className={cn(
              'truncate',
              isDir
                ? entry.name === 'knowledge'
                  ? 'text-amber-500'
                  : 'text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {entry.name}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Actions"
              className="hover-elevate shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
            {isDir ? (
              <>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setExpanded(true);
                    actions.requestCreate(entry.path, 'file');
                  }}
                >
                  <FilePlus className="mr-2 size-3.5" />
                  Nouveau fichier ici
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setExpanded(true);
                    actions.requestCreate(entry.path, 'directory');
                  }}
                >
                  <FolderPlus className="mr-2 size-3.5" />
                  Nouveau dossier ici
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleDownload();
                  }}
                >
                  <Download className="mr-2 size-3.5" />
                  Télécharger
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setRenaming(true);
              }}
            >
              <Pencil className="mr-2 size-3.5" />
              Renommer
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmDelete(true);
              }}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="mr-2 size-3.5" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isDir && expanded && (
        <>
          {creating?.parentPath === entry.path && (
            <CreateRow
              kind={creating.kind}
              depth={depth + 1}
              onSubmit={actions.submitCreate}
              onCancel={actions.cancelCreate}
            />
          )}
          {entry.children?.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              creating={creating}
              actions={actions}
              onSelect={onSelect}
              onInsertReference={onInsertReference}
            />
          ))}
        </>
      )}
    </div>
  );
}

interface RenameRowProps {
  initial: string;
  depth: number;
  Icon: typeof FileText;
  iconClass: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy: boolean;
}

function RenameRow({ initial, depth, Icon, iconClass, onSubmit, onCancel, busy }: RenameRowProps) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const dotIdx = initial.lastIndexOf('.');
    if (dotIdx > 0) inputRef.current?.setSelectionRange(0, dotIdx);
    else inputRef.current?.select();
  }, [initial]);

  return (
    <div
      className="flex items-center gap-1 rounded bg-accent/40 px-1 py-0.5 text-xs"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="size-3 shrink-0" />
      <Icon className={cn('size-3.5 shrink-0', iconClass)} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value);
          else if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onSubmit(value)}
        className="flex-1 rounded-sm border border-input bg-background px-1 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

interface CreateRowProps {
  kind: 'file' | 'directory';
  depth: number;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

function CreateRow({ kind, depth, onSubmit, onCancel }: CreateRowProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = kind === 'directory' ? Folder : FileText;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function commit() {
    if (!value.trim()) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-1 rounded bg-primary/5 px-1 py-0.5 text-xs"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="size-3 shrink-0" />
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          kind === 'directory' ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        placeholder={kind === 'directory' ? 'nouveau-dossier' : 'nouveau-fichier.md'}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') onCancel();
        }}
        onBlur={commit}
        className="flex-1 rounded-sm border border-input bg-background px-1 py-0 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

export function FileTree({
  entries,
  creating,
  actions,
  onSelect,
  onInsertReference,
}: FileTreeProps) {
  const showRootCreate = creating?.parentPath === '';
  const empty = entries.length === 0 && !showRootCreate;

  return (
    <div className="py-1">
      {showRootCreate && (
        <CreateRow
          kind={creating.kind}
          depth={0}
          onSubmit={actions.submitCreate}
          onCancel={actions.cancelCreate}
        />
      )}
      {empty ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Workspace vide. Glisse-dépose un fichier ou crée un dossier.
        </p>
      ) : (
        entries.map((entry) => (
          <FileTreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            creating={creating}
            actions={actions}
            onSelect={onSelect}
            onInsertReference={onInsertReference}
          />
        ))
      )}
    </div>
  );
}

export type { FileTreeProps };
