/**
 * §"grade should be automatically entered when each mark is added" — the
 * pure grading helpers the marks-entry grid's live Grade column uses
 * (modules/examination/grading.ts), so the grid always agrees with the
 * report card's subject grade.
 */
import { describe, expect, it } from "vitest";
import { resolveGradeBand, subjectPercentFromUnits } from "../../modules/examination/grading";
import { resolveGradeBand as fromService } from "../../modules/examination/service";

const bands = [
  { min_percent: "90", max_percent: "100", grade_label: "A+" },
  { min_percent: "80", max_percent: "89.99", grade_label: "A" },
  { min_percent: "0", max_percent: "79.99", grade_label: "B" },
];

describe("subjectPercentFromUnits", () => {
  it("adds TE and CE over their combined maximum", () => {
    expect(subjectPercentFromUnits([
      { max: 80, obtained: 70, absent: false },
      { max: 20, obtained: 18, absent: false },
    ])).toBeCloseTo(88);
  });

  it("drops an absent unit from numerator and denominator", () => {
    expect(subjectPercentFromUnits([
      { max: 80, obtained: null, absent: true },
      { max: 20, obtained: 19, absent: false },
    ])).toBeCloseTo(95);
  });

  it("is null until something is entered", () => {
    expect(subjectPercentFromUnits([{ max: 50, obtained: null, absent: false }])).toBeNull();
  });

  it("keeps a not-yet-entered CE in the denominator", () => {
    expect(subjectPercentFromUnits([
      { max: 80, obtained: 72, absent: false },
      { max: 20, obtained: null, absent: false },
    ])).toBeCloseTo(72);
  });
});

describe("resolveGradeBand", () => {
  it("closes the gap between 89.99 and 90", () => {
    expect(resolveGradeBand(bands, 89.995)?.grade_label).toBe("A+");
    expect(resolveGradeBand(bands, 89.99)?.grade_label).toBe("A");
  });

  it("is the same function the service exports", () => {
    expect(fromService).toBe(resolveGradeBand);
  });
});
