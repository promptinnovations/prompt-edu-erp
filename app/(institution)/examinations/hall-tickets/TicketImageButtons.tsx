"use client";

import { useState } from "react";

/**
 * Hall ticket → PNG image, entirely in the browser (no server, no extra
 * packages): the printed sheet is cloned with its computed styles baked in,
 * drawn through an SVG <foreignObject> onto a canvas, and saved as a PNG —
 * handy for sending a child's ticket on WhatsApp. Each ticket is an A4 page
 * at 2× resolution (1588 × 2246 px).
 */
const W = 794; // A4 width in CSS px at 96 dpi
const H = 1123;
const SCALE = 2;

async function toDataUrl(src: string): Promise<string> {
  try {
    const blob = await (await fetch(src, { credentials: "same-origin" })).blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob);
    });
  } catch { return src; }
}

function bake(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  let css = "";
  for (let i = 0; i < cs.length; i += 1) css += `${cs[i]}:${cs.getPropertyValue(cs[i])};`;
  (dst as HTMLElement).setAttribute("style", css);
  const a = Array.from(src.children), b = Array.from(dst.children);
  a.forEach((child, i) => b[i] && bake(child, b[i]));
}

async function renderCanvas(sheet: HTMLElement): Promise<HTMLCanvasElement> {
  sheet.style.removeProperty("--screen-zoom"); // measure at true A4 size, like printing does
  const clone = sheet.cloneNode(true) as HTMLElement;
  bake(sheet, clone);
  Object.assign(clone.style, { width: `${W}px`, maxWidth: `${W}px`, minHeight: `${H}px`, margin: "0", boxShadow: "none", zoom: "1", background: "#fff" });
  for (const img of Array.from(clone.querySelectorAll("img"))) img.setAttribute("src", await toDataUrl(img.getAttribute("src") ?? ""));
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${xml}</div></foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("render failed")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(SCALE, SCALE); ctx.drawImage(img, 0, 0, W, H);
  return canvas;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), type, q));
const renderPng = async (sheet: HTMLElement) => toBlob(await renderCanvas(sheet), "image/png");

/** Minimal PDF: one A4 page per ticket, each a full-page JPEG. */
async function buildPdf(jpegs: Uint8Array[]): Promise<Blob> {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const offsets: number[] = []; let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = len; push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body); else body.forEach((x) => push(x));
    push("\nendobj\n");
  };
  const PW = 595.28, PH = 841.89, n = jpegs.length;
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);
  const dims = await Promise.all(jpegs.map(() => ({ w: W * SCALE, h: H * SCALE })));
  jpegs.forEach((jpg, i) => {
    const page = 3 + i * 3, content = page + 1, image = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    const stream = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    obj(image, [enc.encode(`<< /Type /XObject /Subtype /Image /Width ${dims[i].w} /Height ${dims[i].h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`), jpg, enc.encode("\nendstream")]);
  });
  const xref = len; const total = 3 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i += 1) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

function save(blob: Blob, name: string, ext = "png") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w.-]+/g, "_") + `.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const sheets = () => Array.from(document.querySelectorAll<HTMLElement>("[data-hall-ticket]"));

export function DownloadAllImages() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run() {
    const list = sheets();
    try {
      for (let i = 0; i < list.length; i += 1) {
        setBusy(`${i + 1} / ${list.length}`);
        save(await renderPng(list[i]), list[i].dataset.hallTicket || `hall-ticket-${i + 1}`);
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch { alert("Could not make the image in this browser. Use Print → Save as PDF instead."); }
    setBusy(null);
  }
  return (
    <button type="button" onClick={run} disabled={!!busy} className="no-print rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-primary-50 disabled:opacity-60">
      {busy ? `Saving ${busy}…` : "Download as images (PNG)"}
    </button>
  );
}

export function DownloadPdf({ label = "Save whole class as PDF" }: { label?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run() {
    const list = sheets(); const jpegs: Uint8Array[] = [];
    try {
      for (let i = 0; i < list.length; i += 1) {
        setBusy(`${i + 1} / ${list.length}`);
        const blob = await toBlob(await renderCanvas(list[i]), "image/jpeg", 0.92);
        jpegs.push(new Uint8Array(await blob.arrayBuffer()));
        await new Promise((r) => setTimeout(r, 0));
      }
      setBusy("PDF");
      save(await buildPdf(jpegs), `hall-tickets-${new Date().toISOString().slice(0, 10)}`, "pdf");
    } catch { alert("Could not make the PDF in this browser. Use Print → Save as PDF instead."); }
    setBusy(null);
  }
  return (
    <button type="button" onClick={run} disabled={!!busy} className="no-print rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-60">
      {busy ? `Making PDF ${busy}…` : label}
    </button>
  );
}

export function DownloadOneImage({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button" disabled={busy}
      onClick={async (e) => {
        const sheet = (e.currentTarget as HTMLElement).closest("[data-ticket-wrap]")?.querySelector<HTMLElement>("[data-hall-ticket]");
        if (!sheet) return;
        setBusy(true);
        try { save(await renderPng(sheet), name); } catch { alert("Could not make the image in this browser. Use Print → Save as PDF instead."); }
        setBusy(false);
      }}
      className="no-print rounded-full border border-[var(--border-subtle)] bg-white px-3 py-1 text-xs hover:bg-primary-50 disabled:opacity-60"
    >
      {busy ? "Saving…" : "Save as image"}
    </button>
  );
}
