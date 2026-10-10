/**
 * PROMPT EDU ERP — unit tests for modules/portfolio/dashboard-service.ts's
 * PURE shaping function, `buildPortfolioDashboardData()`. This is the
 * Student Portfolio Dashboard follow-up ("the student and parent portal
 * should be like this [rich dashboard reference] — do everything needed
 * for that"). No DB access here — see
 * tests/integration/portfolio-dashboard-flow.test.ts for the DB-backed
 * pieces (getStudentAcademicPerformanceByTerm, portfolio_summaries CRUD).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPortfolioDashboardData, ALL_PORTFOLIO_SECTIONS, type PortfolioDashboardInput } from "../../modules/portfolio/dashboard-service";
import type { StudentProfileRecord } from "../../modules/students/service";

afterEach(() => {
  vi.useRealTimers();
});

function baseStudent(overrides: Partial<StudentProfileRecord> = {}): StudentProfileRecord {
  return {
    id: "student-1", admission_number: "ADM-1", full_name: "Test Student", full_name_native: null,
    date_of_birth: "2012-06-15", gender: "male", status: "active", user_id: null,
    contact_email: null, login_id: null, photo_file_id: null,
    contact_phone: "9000000000", address: null, blood_group: "O+", mother_tongue: null,
    national_id: null, sibling_details: null, permanent_address: null, emergency_contact_name: null,
    previous_school: null, highest_grade_completed: null, known_allergies: null,
    chronic_conditions: null, regular_medications: null, vision_hearing_support: null,
    hobbies_talents: null, sports_preferences: null, clubs_interests: null, created_at: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<PortfolioDashboardInput> = {}): PortfolioDashboardInput {
  return {
    student: baseStudent(),
    enrollment: { id: "enr-1", student_id: "student-1", class_id: "cls-1", section_id: "sec-1", academic_year_id: "ay-1", roll_number: 7 },
    classLabel: "Grade 7 A",
    academicYear: { id: "ay-1", name: "2026-2027" },
    latestResult: { examination_name: "Term 2 Exam", percentage: "86.667", grade_label: "A", computed_at: "2026-10-01T00:00:00Z" },
    attendanceSummary: { student_id: "student-1", total_days: 100, present_days: 92, absent_days: 6, late_days: 2, present_percent: 92 },
    academicPerformance: { columns: [], rows: [] },
    achievements: [],
    skillSubmissions: [],
    skillTypes: [],
    skillActivities: [],
    characterAssessments: [],
    characterRatingLabels: [],
    disciplineRecords: null,
    portfolioSummary: null,
    sections: ALL_PORTFOLIO_SECTIONS,
    ...overrides,
  };
}

describe("buildPortfolioDashboardData", () => {
  it("computes age from date_of_birth as of 'now'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    const result = buildPortfolioDashboardData(baseInput());
    // DOB 2012-06-15 -> birthday already passed this year -> 14.
    expect(result.student.age).toBe(14);
  });

  it("age is one less when the birthday hasn't happened yet this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    const result = buildPortfolioDashboardData(baseInput());
    // DOB 2012-06-15 -> birthday hasn't happened yet in March -> 13.
    expect(result.student.age).toBe(13);
  });

  it("returns null age when date_of_birth is null", () => {
    const result = buildPortfolioDashboardData(baseInput({ student: baseStudent({ date_of_birth: null }) }));
    expect(result.student.age).toBeNull();
  });

  it("rounds the overall percentage to one decimal place", () => {
    const result = buildPortfolioDashboardData(baseInput());
    expect(result.stats.overallPercentage).toBe(86.7);
    expect(result.stats.overallGradeLabel).toBe("A");
  });

  it("falls back to null stats when there is no latest result", () => {
    const result = buildPortfolioDashboardData(baseInput({ latestResult: null }));
    expect(result.stats.overallPercentage).toBeNull();
    expect(result.stats.overallGradeLabel).toBeNull();
  });

  it("resolves co-curricular type names via skill activities + skill types", () => {
    const result = buildPortfolioDashboardData(baseInput({
      skillSubmissions: [
        { id: "sub-1", skill_activity_id: "act-1", student_id: "student-1", submitted_at: "2026-09-01", details_jsonb: null, status: "approved", evidence_file_id: null, activity_name: "Weekly Reading Log", student_name: "Test Student" },
      ],
      skillActivities: [
        { id: "act-1", skill_type_id: "type-1", name: "Weekly Reading Log", description: null, evidence_required: false, verification_required: false, approval_required: true, is_active: true },
      ],
      skillTypes: [{ id: "type-1", code: "reading", name: "Reading" }],
    }));
    expect(result.coCurricular).toEqual([
      { id: "sub-1", activityName: "Weekly Reading Log", typeName: "Reading", submittedAt: "2026-09-01" },
    ]);
    expect(result.stats.coCurricularCount).toBe(1);
  });

  it("averages character ratings from only the most recent period for the Behaviour stat", () => {
    const result = buildPortfolioDashboardData(baseInput({
      // Ordered created_at desc, as listCharacterAssessments returns it —
      // the two "Term 2" rows are the latest period; "Term 1" is older.
      characterAssessments: [
        { id: "c1", student_id: "student-1", attribute_id: "a1", attribute_name: "Punctuality", period: "Term 2", rating: 5, assessed_by: null, notes: null },
        { id: "c2", student_id: "student-1", attribute_id: "a2", attribute_name: "Discipline", period: "Term 2", rating: 3, assessed_by: null, notes: null },
        { id: "c3", student_id: "student-1", attribute_id: "a1", attribute_name: "Punctuality", period: "Term 1", rating: 1, assessed_by: null, notes: null },
      ],
      characterRatingLabels: [
        { rating: 1, label: "Requires Attention" }, { rating: 2, label: "Needs Improvement" },
        { rating: 3, label: "Good" }, { rating: 4, label: "Very Good" }, { rating: 5, label: "Outstanding" },
      ],
    }));
    // (5 + 3) / 2 = 4 -> "Very Good", not influenced by the Term 1 rating of 1.
    expect(result.stats.behaviourRatingLabel).toBe("Very Good");
    expect(result.behaviour).toHaveLength(3);
    expect(result.behaviour[0].ratingLabel).toBe("Outstanding");
  });

  it("passes discipline through as null when the caller didn't fetch it (section gated off)", () => {
    const result = buildPortfolioDashboardData(baseInput({ disciplineRecords: null }));
    expect(result.discipline).toBeNull();
  });

  it("carries the sections flag through unchanged for the component to gate on", () => {
    const limited = { ...ALL_PORTFOLIO_SECTIONS, discipline: false, character: false };
    const result = buildPortfolioDashboardData(baseInput({ sections: limited }));
    expect(result.sections).toEqual(limited);
  });
});
