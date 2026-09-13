import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { getInstitution } from "../../../../services/institution/institution-service";
import { listExaminations } from "../../../../modules/examination/service";
import {
  listExamRooms, listSeatingRoster, getSeatingPlan,
} from "../../../../modules/examination/seating-service";
import { genderGroupOf } from "../../../../modules/examination/seating-allocator";
import ExamRoomManager from "./ExamRoomManager";
import GenerateSeatingForm from "./GenerateSeatingForm";
import SeatingPlanChartView from "./SeatingPlanChartView";
import ExamPicker from "./ExamPicker";

/**
 * Examinations > Seating Arrangement — one page for the whole sub-module:
 * the reusable room master list, generating a plan for a chosen
 * examination (with optional ad-hoc rooms for that run), and the resulting
 * room-wise chart. Printable bench stickers live one level down at
 * ./stickers, reusing the app's existing .print-area/.no-print conventions
 * from the Print Center rather than a stylesheet of their own.
 */
export default async function SeatingArrangementPage({
  searchParams,
}: {
  searchParams: Promise<{ examinationId?: string }>;
}) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  // Full-page gate, same pattern as /settings — the sidebar already hides
  // this link, but a typed URL must not reach the generate form either.
  if (!can(ctx.permissions, "examinations.seating.manage")) redirect("/examinations");

  const { examinationId = "" } = await searchParams;

  const [examinations, rooms, institution] = await Promise.all([
    listExaminations(institutionId, authUserId),
    listExamRooms(institutionId, authUserId),
    getInstitution(institutionId, authUserId),
  ]);

  const selectedExam = examinations.find((e) => e.id === examinationId) ?? null;
  const [roster, chart] = selectedExam
    ? await Promise.all([
        listSeatingRoster(institutionId, authUserId, selectedExam.id),
        getSeatingPlan(institutionId, authUserId, selectedExam.id),
      ])
    : [[], null];

  const boyCount = roster.filter((s) => genderGroupOf(s.gender) === "male").length;
  const girlCount = roster.filter((s) => genderGroupOf(s.gender) === "female").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Seating Arrangement</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Generate a room-wise exam seating plan and printable bench stickers for one examination.
        </p>
      </div>

      <section id="rooms" className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Exam rooms</h2>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Set these up once and reuse them for every examination. A room borrowed for one exam only doesn&apos;t
          belong here — add it as an ad-hoc room when you generate that exam&apos;s plan.
        </p>
        <ExamRoomManager rooms={rooms} />
      </section>

      <section id="generate" className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Generate a plan</h2>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Students are taken from the classes and divisions the chosen examination covers.
        </p>
        <ExamPicker examinations={examinations} examinationId={selectedExam?.id ?? ""} />

        {selectedExam ? (
          <div className="mt-5 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            {roster.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                No students are enrolled in the classes this examination covers — link its classes/divisions on the{" "}
                <Link href={`/examinations/${selectedExam.id}`} className="underline">examination detail page</Link> first.
              </p>
            ) : (
              <GenerateSeatingForm
                examinationId={selectedExam.id}
                rooms={rooms}
                studentCount={roster.length}
                boyCount={boyCount}
                girlCount={girlCount}
                genderRule={institution?.examSeatingGenderRule ?? "best_effort"}
                hasExistingPlan={chart !== null}
              />
            )}
          </div>
        ) : null}
      </section>

      {selectedExam && chart ? (
        <SeatingPlanChartView
          chart={chart}
          examinationName={selectedExam.name}
          examinationId={selectedExam.id}
          institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
          logoCode={institution?.logoFileId ? institution.code : null}
        />
      ) : null}
    </div>
  );
}
