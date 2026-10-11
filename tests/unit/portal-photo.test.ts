/**
 * §Portal-photo — the server-side checks on a photo a parent/student
 * uploads from the portal (modules/portal/student-photo.ts).
 */
import { describe, expect, it } from "vitest";
import { validatePortalPhoto, PORTAL_PHOTO_MAX_BYTES } from "../../modules/portal/student-photo";

describe("validatePortalPhoto", () => {
  it("accepts JPG, PNG and WebP within the size cap", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validatePortalPhoto({ size: 200_000, type })).toBeNull();
    }
  });

  it("rejects empty, non-image, unsupported and oversized files", () => {
    expect(validatePortalPhoto(null)).toMatch(/choose/i);
    expect(validatePortalPhoto({ size: 0, type: "image/jpeg" })).toMatch(/choose/i);
    expect(validatePortalPhoto({ size: 1000, type: "application/pdf" })).toMatch(/JPG, PNG or WebP/);
    expect(validatePortalPhoto({ size: 1000, type: "image/svg+xml" })).toMatch(/JPG, PNG or WebP/);
    expect(validatePortalPhoto({ size: PORTAL_PHOTO_MAX_BYTES + 1, type: "image/jpeg" })).toMatch(/5 MB/);
  });
});
