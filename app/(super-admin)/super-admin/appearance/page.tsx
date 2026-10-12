import { redirect } from "next/navigation";

/** §Fixed-look ("this is not required — fix the latest update"): the app
 *  has a single colour scheme (services/branding/palettes.ts APP_PALETTE),
 *  so there is no palette picker any more. Old bookmarks land on the
 *  console home. */
export default function AppearancePage() {
  redirect("/super-admin");
}
