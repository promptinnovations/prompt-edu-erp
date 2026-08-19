"use client";

import { useActionState } from "react";
import { deleteSubstitutionAction } from "./actions";

export default function DeleteSubstitutionButton({ substitutionId }: { substitutionId: string }) {
  const [, formAction, pending] = useActionState<{ error: string | null }, FormData>(deleteSubstitutionAction, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="substitutionId" value={substitutionId} />
      <button type="submit" disabled={pending} className="text-xs text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 disabled:opacity-50">
        Remove
      </button>
    </form>
  );
}
