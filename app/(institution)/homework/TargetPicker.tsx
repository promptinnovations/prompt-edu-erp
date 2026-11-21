"use client";

import { useMemo, useState } from "react";
import { inputClass, labelClass } from "../../components/ui/form-classes";

type Target = { class_id: string; class_name: string; section_id: string | null; section_name: string | null; subject_id: string | null; subject_name: string | null };

/**
 * Class → Division → Subject, each list narrowed by the one before, from
 * the combinations this user may set homework for. Submits one hidden
 * `target` = "<classId>|<sectionId or ''>|<subjectId or ''>".
 */
export default function TargetPicker({ targets }: { targets: Target[] }) {
  const classes = useMemo(() => [...new Map(targets.map((t) => [t.class_id, t.class_name])).entries()], [targets]);
  const [cls, setCls] = useState(classes[0]?.[0] ?? "");
  const divisions = useMemo(() => [...new Map(targets.filter((t) => t.class_id === cls).map((t) => [t.section_id ?? "", t.section_name])).entries()], [targets, cls]);
  const [div, setDiv] = useState(divisions[0]?.[0] ?? "");
  const divValue = divisions.some(([d]) => d === div) ? div : divisions[0]?.[0] ?? "";
  const subjects = useMemo(
    () => targets.filter((t) => t.class_id === cls && (t.section_id ?? "") === divValue).map((t) => [t.subject_id ?? "", t.subject_name ?? "General"] as const),
    [targets, cls, divValue]
  );
  const [sub, setSub] = useState("");
  const subValue = subjects.some(([s]) => s === sub) ? sub : subjects[0]?.[0] ?? "";

  return (
    <>
      <input type="hidden" name="target" value={`${cls}|${divValue}|${subValue}`} />
      <div>
        <label className={labelClass} htmlFor="hw-class">Class</label>
        <select id="hw-class" value={cls} onChange={(e) => setCls(e.target.value)} className={inputClass}>
          {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="hw-div">Division</label>
        <select id="hw-div" value={divValue} onChange={(e) => setDiv(e.target.value)} className={inputClass}>
          {divisions.map(([id, name]) => <option key={id || "all"} value={id}>{name ?? "All divisions"}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="hw-subject">Subject</label>
        <select id="hw-subject" value={subValue} onChange={(e) => setSub(e.target.value)} className={inputClass}>
          {subjects.map(([id, name]) => <option key={id || "general"} value={id}>{name}</option>)}
        </select>
      </div>
    </>
  );
}
