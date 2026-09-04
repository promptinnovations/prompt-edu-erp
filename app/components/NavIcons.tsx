/**
 * PROMPT EDU ERP — one small inline-SVG icon per sidebar item/group
 * (§ sidebar redesign follow-up: "add good symbols for each in the side
 * panel"). Plain outline icons, no external icon library — matches how
 * LoginForm.tsx's password-visibility toggle already does inline SVGs
 * elsewhere in this app, so no new dependency for a fixed, known-small set
 * of glyphs. `strokeWidth` is a touch heavier (1.75) than a typical 24px
 * icon so they stay legible at the ~18px size the sidebar renders them at.
 */
import type { SVGProps } from "react";

function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
      {...props}
    />
  );
}

export const DashboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></Base>
);

export const AcademicIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" /></Base>
);

export const StudentIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="12" cy="8" r="3.25" /><path d="M4.5 20c0-3.5 3.3-6 7.5-6s7.5 2.5 7.5 6" /></Base>
);

export const AttendanceIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 3v3M16 3v3" /><path d="m8 14 2.5 2.5L16 11" /></Base>
);

export const ExamIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M6 3.5h9l3.5 3.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M15 3.5V7h3.5" /><path d="M8.5 12.5h7M8.5 15.5h5" /></Base>
);

export const ResultIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M8 3.5h8v6a4 4 0 0 1-8 0v-6Z" /><path d="M4.5 5.5H8M16 5.5h3.5" /><path d="M12 13.5V17M9 20.5h6" /></Base>
);

export const LibraryIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-1.5H4Z" /><path d="M20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-1.5h6Z" /></Base>
);

export const StaffIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9.5" r="2.25" /><path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5" /><path d="M15.5 14.8c2.6.3 4.5 2.2 4.5 5.2" /></Base>
);

export const SkillsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="m12 3 2.2 4.6 5 .7-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.6 5-.7L12 3Z" /></Base>
);

export const DisciplineIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 3.5 5 6v6c0 4.2 2.9 7.3 7 8.5 4.1-1.2 7-4.3 7-8.5V6l-7-2.5Z" /><path d="m9.5 12 1.8 1.8L15 10" /></Base>
);

export const MentoringIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 21c-4.5-2.7-8-6-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 4-3.5 7.3-8 10Z" /></Base>
);

export const AnalysisIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M4 20h16" /></Base>
);

export const PrintIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M7 8V3.5h10V8" /><rect x="4" y="8" width="16" height="8" rx="1.5" /><path d="M7 15.5h10V20.5H7Z" /></Base>
);

export const ClassesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3.5" y="5" width="17" height="13" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 5v-1.5M16 5v-1.5" /></Base>
);

export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 20c0-3.3 2.5-5.7 5.5-5.7s5.5 2.4 5.5 5.7" /><path d="M16 8.3a2.6 2.6 0 1 1 0 5.2" /><path d="M18 14.6c1.8.6 3 2.4 3 4.9" /></Base>
);

export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 8.2 2.6l.1.1a1.7 1.7 0 0 0 1.9.3H10.4a1.7 1.7 0 0 0 1-1.6V1.4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1.1Z" /></Base>
);

export const SuperAdminIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="m12 2 8 3.5v5c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11v-5L12 2Z" /><path d="m9.5 12 1.8 1.8L15 9.5" /></Base>
);

export const ImportIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 3.5v11M8 11l4 4 4-4" /><path d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" /></Base>
);

export const AnnouncementIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 10.5v3a1 1 0 0 0 1 1h1.5l4 3.5v-12l-4 3.5H5a1 1 0 0 0-1 1Z" /><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></Base>
);

export const StorageIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M3.5 7V5.5a1 1 0 0 1 1-1H9l2 2h8a1 1 0 0 1 1 1V7" /></Base>
);

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 3v3M16 3v3" /><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2" /></Base>
);

export const SubstitutionIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="8" cy="8" r="3" /><path d="M2.5 20c0-3.3 2.5-5.7 5.5-5.7 1.2 0 2.3.4 3.2 1" /><path d="M14.5 6.5h6M17.5 3.5v6" /><path d="M14.5 14.5h6M17.5 11.5v6" /></Base>
);

// Phase D — Fee/Accounts/Communication modules.
export const FeesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17" /><path d="M7 14.5h4" /></Base>
);

export const AccountsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 3v18M8 6.5h5.5a2.5 2.5 0 0 1 0 5H10a2.5 2.5 0 0 0 0 5h6" /></Base>
);

export const MessagesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 5.5h16v11H9l-4 3.5v-3.5H4Z" /></Base>
);

export const KudosIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 20s-6.5-4.2-9-8.2C1.2 8.7 2.6 5.5 6 5c2-.3 3.6.7 6 3 2.4-2.3 4-3.3 6-3 3.4.5 4.8 3.7 3 6.8-2.5 4-9 8.2-9 8.2Z" /></Base>
);

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 transition-transform" aria-hidden="true" {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
