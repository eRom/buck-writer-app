import { useState, useEffect } from 'react';
import type { FileEntry } from '@buck/shared';

interface AtReferenceProps {
  query: string;
  entries: FileEntry[];
  onSelect: (path: string) => void;
  onClose: () => void;
}

function flattenEntries(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.type === 'file') result.push(entry);
    if (entry.children) result.push(...flattenEntries(entry.children));
  }
  return result;
}

export function AtReference({ query, entries, onSelect, onClose }: AtReferenceProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const flatFiles = flattenEntries(entries);
  const filtered = query
    ? flatFiles.filter((e) => e.path.toLowerCase().includes(query.toLowerCase()))
    : flatFiles;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        onSelect(filtered[selectedIndex]!.path);
      } else if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 max-h-48 w-64 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
      {filtered.slice(0, 20).map((entry, i) => (
        <button
          key={entry.path}
          className={`flex w-full items-center px-3 py-1.5 text-left text-xs ${
            i === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(entry.path);
          }}
        >
          {entry.path}
        </button>
      ))}
    </div>
  );
}
