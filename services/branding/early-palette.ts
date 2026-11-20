/**
 * §Palette-first-paint ("new colour takes extra time to load"): the
 * palette used to arrive only with each section layout's inline <style>
 * (institution / portal / login), which renders after that layout's data
 * has loaded — until then the page (and every loading skeleton) showed
 * globals.css's built-in defaults, so the old colour flashed first.
 *
 * The root layout now puts the right palette in <head>, before anything
 * paints: the institution from the URL prefix (middleware's
 * x-institution-code) or the active-institution cookie, else the platform
 * default. One small indexed lookup, deduplicated per request.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getInstitutionPublicSummaryByCode } from "../institution/institution-service";
import { ACTIVE_INSTITUTION_COOKIE } from "../tenant/institution-cookie";
import { APP_PALETTE, resolveInstitutionPalette, type ThemePalette } from "./palettes";

export const getEarlyPalette = cache(async (): Promise<ThemePalette> => {
  const code = (await headers()).get("x-institution-code") || (await cookies()).get(ACTIVE_INSTITUTION_COOKIE)?.value || null;
  if (!code) return APP_PALETTE;
  const institution = await getInstitutionPublicSummaryByCode(code).catch(() => null);
  return institution ? resolveInstitutionPalette(institution.themePalette) : APP_PALETTE;
});
