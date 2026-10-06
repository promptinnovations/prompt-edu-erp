/** Client-safe Learner Record constants (no DB imports). */
export const LEARNER_SECTIONS = [
  "quran", "language", "certification", "activity", "health",
  "house_points", "teacher_comment", "reflection", "goal",
] as const;
export type LearnerSection = (typeof LEARNER_SECTIONS)[number];

export const SECTION_META: Record<LearnerSection, { label: string; hint: string; titleLabel: string; valueLabel: string; levelLabel: string; showHours?: boolean; studentCanAdd?: boolean }> = {
  quran: { label: "Quran & Islamic studies", hint: "Hifz, tajweed, recitation and Arabic progress.", titleLabel: "Item (e.g. Hifz — Juz 30, Tajweed, Recitation)", valueLabel: "Progress (e.g. Juz 1–5, Surah Baqarah 1–50)", levelLabel: "Rating (e.g. Excellent, Mujawwad)" },
  language: { label: "Languages", hint: "Proficiency in each language.", titleLabel: "Language", valueLabel: "Level (e.g. B2, Fluent)", levelLabel: "Skill (Speaking / Writing / Reading)" },
  certification: { label: "Certificates & external exams", hint: "Certificates earned outside regular school exams.", titleLabel: "Certificate / exam", valueLabel: "Result (e.g. Grade A, 92%)", levelLabel: "Awarding body" },
  activity: { label: "Service, leadership & activities", hint: "Community service, leadership roles, clubs, scouts, NCC.", titleLabel: "Activity or role", valueLabel: "Role / outcome", levelLabel: "Level (School / Zone / District…)", showHours: true },
  health: { label: "Fitness & wellbeing", hint: "Non-diagnostic only — height, weight, fitness test, vision screening result. No medical diagnoses.", titleLabel: "Measure", valueLabel: "Result (e.g. 142 cm, 9.2 s)", levelLabel: "Remark" },
  house_points: { label: "House & points", hint: "House points earned and the event they came from.", titleLabel: "Event / reason", valueLabel: "Points (e.g. 10)", levelLabel: "House" },
  teacher_comment: { label: "Teacher comments", hint: "Term-wise narrative comment.", titleLabel: "Subject or area (e.g. Overall)", valueLabel: "", levelLabel: "" },
  reflection: { label: "Student reflections", hint: "In the student's own words.", titleLabel: "Topic", valueLabel: "", levelLabel: "", studentCanAdd: true },
  goal: { label: "Goals", hint: "Targets for the next term.", titleLabel: "Goal", valueLabel: "Target / measure", levelLabel: "", studentCanAdd: true },
};

