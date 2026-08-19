/**
 * PROMPT EDU ERP — institution logo, pre-authentication. The one file in
 * this codebase that genuinely needs to be fetchable by someone who hasn't
 * signed in yet (the /login page's brand panel, before any session exists)
 * — every other file download (app/api/files/[fileId]/route.ts) requires
 * requireRequestContext() first. Deliberately keyed by institution CODE
 * (not a raw file id) so the URL itself never needs to be looked up or
 * passed around beyond the code already present in every institution's own
 * /<code> URL and login page.
 *
 * getPublicLogoFile() in services/institution/institution-service.ts does
 * the actual narrow, safe lookup (see that function's own doc comment); this
 * route only streams the bytes it returns, mirroring app/api/files/
 * [fileId]/route.ts's local-vs-redirect split for the two storage providers.
 */
import { NextResponse } from "next/server";
import { getPublicLogoFile } from "../../../../services/institution/institution-service";
import { getStorageProviderByName } from "../../../../services/storage/storage-provider";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const file = await getPublicLogoFile(code).catch(() => null);
  if (!file) return NextResponse.json({ error: "No logo set for this institution." }, { status: 404 });

  if (file.storageProvider !== "local") {
    const url = await getStorageProviderByName(file.storageProvider).getDownloadUrl(file.storageFileId);
    return NextResponse.redirect(url);
  }

  const bytes = await getStorageProviderByName("local").download(file.storageFileId);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      // Logos change rarely and the URL has no cache-busting token, so a
      // short public cache is fine — long enough to avoid re-fetching on
      // every sidebar/login render, short enough that a just-changed logo
      // shows up within the hour without a hard refresh.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
