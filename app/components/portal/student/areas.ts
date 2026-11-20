/**
 * One colour + icon per portal area, used for its page header, its tile on
 * the dashboard and its charts — so "blue" always means academics, "aqua"
 * always attendance, and so on, everywhere in the portal. Slots follow the
 * validated chart palette's fixed order (app/components/charts/series.ts).
 */
import { decorColor } from "../viz/palette";

export const AREA = {
  academics: { color: decorColor(0), icon: "📚", href: "/portal/student/exams", label: "Academics" },
  achievements: { color: decorColor(1), icon: "🏆", href: "/portal/student/portfolio", label: "Achievements" },
  attendance: { color: decorColor(2), icon: "🗓️", href: "/portal/student/attendance", label: "Attendance" },
  reading: { color: decorColor(3), icon: "📖", href: "/portal/student/library", label: "Library & reading" },
  growth: { color: decorColor(4), icon: "🌱", href: "/portal/student/growth", label: "Growth & conduct" },
} as const;
