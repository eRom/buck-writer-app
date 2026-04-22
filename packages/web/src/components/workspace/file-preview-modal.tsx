import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';

interface FilePreviewModalProps {
  path: string | null;
  onClose: () => void;
}

const TEXT_EXTS = ['md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'csv', 'log', 'ini', 'env'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i >= 0 ? p.slice(i + 1).toLowerCase() : '';
}

export function FilePreviewModal({ path, onClose }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ext = path ? extOf(path) : '';
  const isImage = IMAGE_EXTS.includes(ext);
  const isMarkdown = ext === 'md' || ext === 'mdx';
  const isText = TEXT_EXTS.includes(ext);

  useEffect(() => {
    if (!path || isImage) {
      setContent(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setContent(text))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path, isImage]);

  const filename = path ? path.split('/').pop() ?? path : '';

  return (
    <Dialog open={path !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-xs text-muted-foreground">
            {path}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Chargement…
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">Erreur : {error}</p>
          )}

          {isImage && path && (
            <img
              src={`/api/workspace/file?path=${encodeURIComponent(path)}`}
              alt={filename}
              className="mx-auto max-h-[60vh] rounded-md border border-border"
            />
          )}

          {!isImage && content !== null && isMarkdown && (
            <div className="prose prose-invert max-w-none text-sm">
              <MarkdownRenderer content={content} />
            </div>
          )}

          {!isImage && content !== null && !isMarkdown && isText && (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
              {content}
            </pre>
          )}

          {!isImage && content !== null && !isText && !isMarkdown && (
            <p className="text-xs text-muted-foreground">
              Aperçu indisponible pour ce type de fichier. Extension : <code>.{ext || '?'}</code>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
