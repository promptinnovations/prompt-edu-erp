/**
 * PROMPT EDU ERP — shared rich-text sanitizer.
 *
 * §Reviews-rich-text follow-up ("Support basic rich-text formatting: Bold,
 * Italic, Underline, Left/Centre/Right alignment, paragraph spacing").
 * RichTextEditor.tsx (app/components) produces HTML client-side via
 * document.execCommand on a contentEditable region; that HTML is
 * user-controlled and gets rendered back to OTHER users via
 * dangerouslySetInnerHTML (see RichTextContent.tsx), so it must be
 * sanitized server-side before it is ever persisted — never trust the
 * client's DOM output, and never sanitize only on the read path (a
 * stored-XSS payload would still round-trip through any other reader of
 * the same column, e.g. an admin export). This is the single choke point
 * every review-writing server action (library review, self-review) must
 * call before writing to `reading_records.review_text` — reused as-is
 * rather than duplicated per call site, matching the existing
 * "review_text is one plain column, several writers" shape (§Page-8).
 *
 * Deliberately narrow allowlist: only the tags/attributes the toolbar can
 * actually produce. No links, images, scripts, styles, or arbitrary
 * attributes — those aren't part of "basic rich-text formatting" and each
 * would reopen its own XSS surface (href="javascript:...", style
 * expressions, etc).
 */
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = ["p", "b", "strong", "i", "em", "u", "br", "span", "div"];
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  // Only ever emitted by the editor's alignment buttons (text-align on the
  // block the caret is in) — never accepts arbitrary CSS from the client.
  p: ["style"], div: ["style"], span: ["style"],
};
const ALLOWED_STYLES: sanitizeHtml.IOptions["allowedStyles"] = {
  "*": { "text-align": [/^(left|center|right)$/] },
};

/** Sanitizes rich-text HTML for storage/display. Also collapses to `null`
 *  when the result has no visible text, so a review that's all-whitespace
 *  formatting doesn't get saved as a "review" (mirrors the existing
 *  `if (!reviewText) return { error }` plain-text checks at each call
 *  site — those check the raw string, this is the HTML-aware version used
 *  where callers need to know "is there actually anything here"). */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    disallowedTagsMode: "discard",
    // Anything not a recognized block/inline formatting element (script,
    // style, img, a, iframe, ...) is stripped but its text content kept —
    // matches "basic rich-text formatting" intent (never silently drops a
    // paragraph the user actually typed just because it also included,
    // say, a pasted <a> tag).
  }).trim();
}

/** True when sanitized HTML has no visible text (only tags/whitespace). */
export function isRichTextEmpty(html: string): boolean {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s|&nbsp;/g, "").length === 0;
}
