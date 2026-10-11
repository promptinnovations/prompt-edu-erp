/**
 * PROMPT EDU ERP — file download route (§T.1). The local provider has no
 * durable public URL, so its bytes are streamed directly through this
 * route; every other provider instead redirects to that provider's own
 * (typically signed, TTL'd) download URL — see services/storage/
 * file-service.ts's resolveFileForServing().
 *
 * §Perf: one files lookup, no download before a redirect, and browser
 * caching. A file id's content never changes (a new photo is a new file
 * row), so the browser may keep the bytes; a redirect is cached for half
 * the signed URL's 1-hour lifetime. `private` — never a shared cache, since
 * every file is tenant-scoped and behind auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { resolveFileForServing } from "../../../../services/storage/file-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!ctx.institutionId) return NextResponse.json({ error: "No active institution." }, { status: 400 });

  const result = await resolveFileForServing(ctx.institutionId, ctx.session.authUserId, fileId);
  if (!result) return NextResponse.json({ error: "File not found." }, { status: 404 });

  if ("url" in result) {
    const res = NextResponse.redirect(result.url);
    res.headers.set("Cache-Control", "private, max-age=1800");
    return res;
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.file.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${result.file.file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
