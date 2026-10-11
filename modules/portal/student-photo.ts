/**
 * PROMPT EDU ERP — student photo from the portal.
 *
 * §Portal-photo ("parent/student should be able to add their picture in
 * the portal, if added it will be used in apps wherever required"). The
 * photo is written to the SAME students.photo_file_id the staff profile
 * uses (modules/students/service.ts updateStudentPhoto()), so it appears
 * everywhere a student photo already shows — report cards, the student
 * profile, the portal sidebar, ID-style headers — with no second copy.
 *
 * Callers resolve WHICH student server-side (the signed-in student's own
 * record, or a parent's verified own child — never a studentId taken on
 * trust from the form); this module only validates and stores the image.
 */
import { uploadFile } from "../../services/storage/file-service";
import { updateStudentPhoto } from "../students/service";

export const PORTAL_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** The browser already downsizes before upload (PortalPhotoUploader), so a
 *  real upload is ~100-300 KB; this cap only stops an oversized original
 *  from a browser that couldn't resize. */
export const PORTAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function validatePortalPhoto(photo: { size: number; type: string } | null): string | null {
  if (!photo || photo.size === 0) return "Choose a photo to upload.";
  if (!(PORTAL_PHOTO_TYPES as readonly string[]).includes(photo.type)) return "Use a JPG, PNG or WebP image.";
  if (photo.size > PORTAL_PHOTO_MAX_BYTES) return "That photo is larger than 5 MB — choose a smaller one.";
  return null;
}

export async function setStudentPhotoFromPortal(
  institutionId: string, authUserId: string, userId: string, studentId: string, photo: File
): Promise<string> {
  const problem = validatePortalPhoto(photo);
  if (problem) throw new Error(problem);
  const bytes = Buffer.from(await photo.arrayBuffer());
  const uploaded = await uploadFile(institutionId, authUserId, userId, {
    entityType: "students", entityId: studentId, fileName: photo.name || "photo.jpg", mimeType: photo.type, isPublic: false, bytes,
  });
  await updateStudentPhoto(institutionId, authUserId, userId, studentId, uploaded.id);
  return uploaded.id;
}
