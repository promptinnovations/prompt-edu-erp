"use client";

import { useRef, useState, useEffect, useCallback } from "react";

/**
 * §Reviews-rich-text follow-up — a small, dependency-free rich-text input:
 * a contentEditable region + a toolbar (Bold/Italic/Underline, Left/Centre/
 * Right align), mirroring a plain <textarea>'s form integration by writing
 * its HTML into a hidden <input name={name}> on every change. Every
 * existing `<form action={formAction}>` + useActionState call site that
 * used to render `<textarea name="reviewText">` swaps in
 * `<RichTextEditor name="reviewText">` and needs no other change — the
 * server action still reads `formData.get("reviewText")`, just as an HTML
 * string now instead of plain text (sanitized server-side by
 * services/content/rich-text.ts before it's ever stored).
 *
 * document.execCommand is deprecated but still the only zero-dependency
 * way to get real bold/italic/underline/align toggling in a contentEditable
 * region across current Chrome/Firefox/Safari/Edge — pulling in a full
 * editor library (TipTap/Slate/Quill) for "bold, italic, underline, three
 * alignments" would be a large new dependency for a small, well-scoped
 * requirement, so this stays intentionally minimal.
 */
export default function RichTextEditor({
  name, defaultValue = "", placeholder, minHeightClassName = "min-h-[10rem]", required,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  minHeightClassName?: string;
  required?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [isEmpty, setIsEmpty] = useState(!defaultValue.replace(/<[^>]*>/g, "").trim());

  const syncHidden = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    if (hiddenRef.current) hiddenRef.current.value = html;
    setIsEmpty(!(editorRef.current?.textContent ?? "").trim());
  }, []);

  // defaultValue only applies once, on mount — same contract as an
  // uncontrolled <textarea defaultValue>, so re-renders never clobber
  // what the person is actively typing.
  useEffect(() => {
    if (editorRef.current && defaultValue) editorRef.current.innerHTML = defaultValue;
    syncHidden();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncHidden();
  }

  const ToolbarButton = ({ command, value, label, children }: { command: string; value?: string; label: string; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep focus/selection in the editor, not the button
      onClick={() => exec(command, value)}
      className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 focus-within:ring-1 focus-within:ring-indigo-400 focus-within:border-indigo-400">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-200 dark:border-zinc-800 px-1.5 py-1">
        <ToolbarButton command="bold" label="Bold"><span className="font-bold">B</span></ToolbarButton>
        <ToolbarButton command="italic" label="Italic"><span className="italic">I</span></ToolbarButton>
        <ToolbarButton command="underline" label="Underline"><span className="underline">U</span></ToolbarButton>
        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
        <ToolbarButton command="justifyLeft" label="Align left">⯇</ToolbarButton>
        <ToolbarButton command="justifyCenter" label="Align centre">▤</ToolbarButton>
        <ToolbarButton command="justifyRight" label="Align right">⯈</ToolbarButton>
      </div>
      <div className="relative">
        {isEmpty && placeholder ? (
          <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-zinc-400 dark:text-zinc-500">{placeholder}</p>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncHidden}
          onBlur={syncHidden}
          className={`${minHeightClassName} w-full overflow-y-auto rounded-b-lg px-3 py-2.5 text-sm leading-relaxed text-zinc-900 focus:outline-none dark:text-zinc-50 [&_p]:my-1.5`}
        />
      </div>
      {/* No `required` here on purpose -- browsers silently refuse to
          submit a form containing a required type="hidden" input with no
          focusable UI to report the error against, which would make the
          whole form appear to do nothing. Emptiness is enforced
          server-side instead (see isRichTextEmpty in
          services/content/rich-text.ts), same as before this editor
          existed. */}
      <input ref={hiddenRef} type="hidden" name={name} />
    </div>
  );
}
