import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TerminalBlockProps {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  killed?: boolean;
  truncated?: boolean;
}

// Strip ANSI escape codes
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

const COLLAPSED_LINES = 5;

export function TerminalBlock({
  command,
  stdout,
  stderr,
  exitCode,
  killed,
  truncated,
}: TerminalBlockProps) {
  const cleanStdout = stripAnsi(stdout);
  const cleanStderr = stripAnsi(stderr);
  const outputLines = cleanStdout.split('\n').filter(Boolean);
  const isLong = outputLines.length > 10;
  const [expanded, setExpanded] = useState(!isLong);

  const displayLines = expanded ? outputLines : outputLines.slice(0, COLLAPSED_LINES);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-zinc-900 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 bg-zinc-800 px-3 py-1.5">
        <span className="text-zinc-300">$ {command}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            exitCode === 0
              ? 'bg-emerald-900/50 text-emerald-400'
              : 'bg-red-900/50 text-red-400'
          }`}
        >
          {killed ? 'TIMEOUT' : exitCode === 0 ? 'OK' : `EXIT ${exitCode}`}
        </span>
      </div>

      {/* Output */}
      <div className="px-3 py-2">
        {displayLines.length > 0 && (
          <pre className="whitespace-pre-wrap text-zinc-200">
            {displayLines.join('\n')}
          </pre>
        )}
        {cleanStderr && (
          <pre className="mt-1 whitespace-pre-wrap text-orange-400">
            {stripAnsi(cleanStderr)}
          </pre>
        )}
        {truncated && (
          <p className="mt-1 text-zinc-500">(output tronqué à 100KB)</p>
        )}
        {killed && (
          <p className="mt-1 text-zinc-500">(commande interrompue après 30s)</p>
        )}
      </div>

      {/* Expand/collapse toggle */}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 border-t border-zinc-700 bg-zinc-800 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" /> Réduire
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" /> Voir tout ({outputLines.length} lignes)
            </>
          )}
        </button>
      )}
    </div>
  );
}
