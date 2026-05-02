import { useState } from 'react';
import { Folder, FolderOpen, FileText, Brain, ChevronRight, ChevronDown } from 'lucide-react';
import type { FileEntry } from '@buck/shared';
import { cn } from '@/lib/utils';

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

function entryIcon(entry: FileEntry, expanded: boolean) {
  if (entry.type === 'directory') {
    if (entry.name === 'knowledge') {
      return { Icon: Brain, className: 'text-amber-500' };
    }
    return { Icon: expanded ? FolderOpen : Folder, className: 'text-foreground' };
  }
  return { Icon: FileText, className: 'text-muted-foreground' };
}

function FileTreeItem({ entry, depth, onSelect, onInsertReference }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = entry.type === 'directory';
  const indent = depth * 12;
  const { Icon, className: iconClass } = entryIcon(entry, expanded);
  const Chevron = expanded ? ChevronDown : ChevronRight;

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
