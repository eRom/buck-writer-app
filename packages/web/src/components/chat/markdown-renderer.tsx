import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm prose-invert max-w-none
      prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted
      prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5
      prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-1
      prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-1
      prose-a:text-primary prose-a:underline">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
      >
        {content}
      </Markdown>
    </div>
  );
}
