'use client'

import ReactMarkdown from 'react-markdown'
import { memo } from 'react'

/**
 * Renderiza markdown da resposta da IA.
 * Sem syntax-highlighting pesado, mas com quebras de linha preservadas.
 */
function MdImpl({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert
      prose-p:leading-[1.75] prose-p:my-3 prose-p:text-[0.95rem]
      prose-headings:font-serif prose-headings:mt-4 prose-headings:mb-2
      prose-pre:bg-muted prose-pre:text-foreground prose-pre:p-3 prose-pre:rounded-md prose-pre:my-3 prose-pre:text-xs prose-pre:overflow-x-auto
      prose-code:before:hidden prose-code:after:hidden prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em]
      prose-strong:text-foreground prose-strong:font-semibold
      prose-blockquote:border-l-primary prose-blockquote:italic prose-blockquote:text-muted-foreground prose-blockquote:my-3 prose-blockquote:pl-4
      prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-[1.7]
      prose-a:text-primary prose-a:underline
      [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(MdImpl)
