"use client";

import type { CSSProperties, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { acknowledgeSubstitutionAction } from "./actions";

function Press({ className, style, title, children }: { className?: string; style?: CSSProperties; title?: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} title={title} className={`${className ?? ""} ${pending ? "opacity-60" : ""}`} style={style}>
      {children}
    </button>
  );
}

/** The highlighted substitution itself is the button: one tap signs that the
 *  covering teacher has taken the period. */
export default function AckSubstitutionButton({ substitutionId, className, style, title, children }: {
  substitutionId: string; className?: string; style?: CSSProperties; title?: string; children: ReactNode;
}) {
  return (
    <form action={acknowledgeSubstitutionAction} className="w-full">
      <input type="hidden" name="substitutionId" value={substitutionId} />
      <Press className={className} style={style} title={title}>{children}</Press>
    </form>
  );
}
