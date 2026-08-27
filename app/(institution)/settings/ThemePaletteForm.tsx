"use client";

import PalettePicker from "../../components/PalettePicker";
import { updateThemeAction } from "./actions";

/** Institution Settings' "Appearance" section — thin wrapper around the
 *  shared PalettePicker (also used by Super Admin's platform-wide default,
 *  app/(super-admin)/super-admin/appearance/page.tsx) bound to this
 *  institution's own self-service write. */
export default function ThemePaletteForm({ currentId }: { currentId: string | null }) {
  return <PalettePicker currentId={currentId} action={updateThemeAction} allowPlatformDefault />;
}
