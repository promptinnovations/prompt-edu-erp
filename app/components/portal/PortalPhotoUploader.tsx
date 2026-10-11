"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";

type PhotoAction = (prev: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;

/** Longest side of the stored photo. Big enough for a report card's 26x32mm
 *  photo box at print resolution, small enough to keep uploads ~100-300 KB
 *  on a phone connection. */
const MAX_SIDE = 720;

/** Downsizes a picked image in the browser and re-encodes it as JPEG.
 *  Falls back to the original file when the browser can't decode it (the
 *  server still validates type and size). */
async function shrinkImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return file;
    g.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** §Portal-photo ("parent/student should be able to add their picture in
 *  the portal") — the portal's profile avatar with a camera button: pick a
 *  photo (or take one on a phone), check the preview, Save. The action
 *  decides whose photo it is server-side; `studentId` is only a hint the
 *  parent action re-verifies against the parent's own children. */
export default function PortalPhotoUploader({
  photoFileId, name, action, studentId, sizeClass = "h-16 w-16 text-xl",
}: {
  photoFileId: string | null;
  name: string;
  action: PhotoAction;
  studentId?: string | null;
  sizeClass?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); return; }
    setError(null);
    const small = await shrinkImage(file);
    setPicked(small);
    setPreviewUrl(URL.createObjectURL(small));
  }

  function cancel() { setPicked(null); setPreviewUrl(null); setError(null); }

  function save() {
    if (!picked) return;
    const fd = new FormData();
    fd.set("photo", picked);
    if (studentId) fd.set("studentId", studentId);
    startTransition(async () => {
      const res = await action({ error: null }, fd);
      if (res.error) setError(res.error);
      else { setPicked(null); setPreviewUrl(null); }
    });
  }

  const src = previewUrl ?? (photoFileId ? `/api/files/${photoFileId}` : null);

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own /api/files route or a local preview
          <img src={src} alt="" className={`${sizeClass} rounded-full object-cover ring-2 ring-[var(--surface-muted)]`} />
        ) : (
          <span className={`${sizeClass} flex items-center justify-center rounded-full bg-[var(--surface-muted)] font-medium text-zinc-500 ring-2 ring-[var(--surface-muted)]`}>
            {(name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          title={photoFileId ? "Change photo" : "Add photo"}
          aria-label={photoFileId ? "Change photo" : "Add photo"}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[var(--brand)] text-white shadow hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      </div>
      {picked || error ? (
        <div className="flex flex-col gap-1.5">
          {picked ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={save} disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
                {pending ? "Saving…" : "Save photo"}
              </button>
              <button type="button" onClick={cancel} disabled={pending} className="text-xs text-zinc-500 underline hover:text-zinc-800">Cancel</button>
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
