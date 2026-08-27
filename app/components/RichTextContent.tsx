import { sanitizeRichText } from "../../services/content/rich-text";

/**
 * §Reviews-rich-text follow-up — displays sanitized rich-text HTML (from
 * RichTextEditor.tsx, stored e.g. in reading_records.review_text) with
 * clean typography/spacing. Re-sanitizes on the READ path too (not just on
 * write) — cheap, and it means a row written before this sanitizer existed,
 * or edited directly, can never carry an unsafe payload into
 * dangerouslySetInnerHTML just because the write path missed it once.
 */
export default function RichTextContent({ html, className = "" }: { html: string; className?: string }) {
  const safe = sanitizeRichText(html);
  return (
    <div
      className={`text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
