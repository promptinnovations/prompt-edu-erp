import QRCode from "qrcode";

/** QR code drawn as an SVG path (no innerHTML / inline styles → CSP-safe). */
export default function RecordQr({ url, size = 96 }: { url: string; size?: number }) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} role="img" aria-label="Scan to verify this record" shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
