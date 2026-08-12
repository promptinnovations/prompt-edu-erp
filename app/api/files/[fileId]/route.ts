/**
 * PROMPT EDU ERP — file download route (§T.1). The local provider has no
 * durable public URL, so its bytes are streamed directly through this
 * route; every other provider instead redirects to that provider's own
 * (typically signed, TTL'd) download URL — see services/storage/
 * file-service.ts's getDownloadUrl().
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { downloadFileBytes, getDownloadUrl } from "../../../../services/storage/file-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!ctx.institutionId) return NextResponse.json({ error: "No active institution." }, { status: 400 });

  const result = await downloadFileBytes(ctx.institutionId, ctx.session.authUserId, fileId);
  if (!result) return NextResponse.json({ error: "File not found." }, { status: 404 });

  if (result.file.storage_provider !== "local") {
    const url = await getDownloadUrl(ctx.institutionId, ctx.session.authUserId, fileId);
    if (!url) return NextResponse.json({ error: "File not found." }, { status: 404 });
    return NextResponse.redirect(url);
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.file.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${result.file.file_name.replace(/"/g, "")}"`,
    },
  });
}
