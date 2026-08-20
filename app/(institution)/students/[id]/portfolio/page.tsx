import { redirect } from "next/navigation";

/**
 * §Student Profile feature — superseded by the tabbed Profile page's own
 * Summary + Student Portfolio tabs (see ../page.tsx), which cover
 * everything this standalone page used to show. Kept as a redirect rather
 * than deleted outright so any old bookmark/link to "Student 360°" still
 * lands somewhere useful instead of 404ing.
 */
export default async function StudentPortfolioRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/students/${id}?tab=portfolio`);
}
