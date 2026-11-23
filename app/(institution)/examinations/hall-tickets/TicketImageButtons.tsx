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

async function renderPng(sheet: HTMLElement): Promise<Blob> {
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
  return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
}

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w.-]+/g, "_") + ".png";
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
