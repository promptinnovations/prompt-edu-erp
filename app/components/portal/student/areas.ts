/**
 * One colour + icon per portal area, used for its page header, its tile on
 * the dashboard and its charts — so "blue" always means academics, "aqua"
 * always attendance, and so on, everywhere in the portal. Slots follow the
 * validated chart palette's fixed order (app/components/charts/series.ts).
 */
import { seriesColor } from "../viz/palette";

export const AREA = {
  academics: { color: seriesColor(0), icon: "📚", href: "/portal/student/exams", label: "Academics" },
  achievements: { color: seriesColor(1), icon: "🏆", href: "/portal/student/portfolio", label: "Achievements" },
  attendance: { color: seriesColor(2), icon: "🗓️", href: "/portal/student/attendance", label: "Attendance" },
  reading: { color: seriesColor(3), icon: "📖", href: "/portal/student/library", label: "Library & reading" },
  growth: { color: seriesColor(4), icon: "🌱", href: "/portal/student/growth", label: "Growth & conduct" },
} as const;
