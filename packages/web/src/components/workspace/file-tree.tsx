import { useState } from 'react';
import type { FileEntry } from '@buck/shared';

interface FileTreeProps {
  entries: FileEntry[];
  onSelect?: (entry: FileEntry) => void;
  onInsertReference?: (path: string) => void;
}

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  onSelect?: (entry: FileEntry) => void;
  onInsertReference?: (path: string) => void;
}

function FileTreeItem({ entry, depth, onSelect, onInsertReference }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = entry.type === 'directory';
  const indent = depth * 12;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else onSelect?.(entry);
        }}
        onDoubleClick={() => {
          if (!isDir) onInsertReference?.(entry.path);
        }}
      >
        <span className={isDir ? 'text-primary' : 'text-muted-foreground'}>
          {isDir ? (expanded ? 'v ' : '> ') : '  '}
        </span>
        <span className={isDir ? 'text-primary' : 'text-muted-foreground'}>
          {entry.name}{isDir ? '/' : ''}
        </span>
      </button>
      {isDir && expanded && entry.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          onSelect={onSelect}
          onInsertReference={onInsertReference}
        />
      ))}
    </div>
  );
}

export function FileTree({ entries, onSelect, onInsertReference }: FileTreeProps) {
  if (entries.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Workspace vide</p>;
  }

  return (
    <div className="py-1">
      {entries.map((entry) => (
        <FileTreeItem
          key={entry.path}
          entry={entry}
          depth={0}
          onSelect={onSelect}
          onInsertReference={onInsertReference}
        />
      ))}
    </div>
  );
}
