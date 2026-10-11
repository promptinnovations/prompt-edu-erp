/**
 * PROMPT EDU ERP — run follow-up work after the response (§Perf).
 *
 * Saving marks used to make the teacher wait for the whole examination's
 * results to be recomputed AND for both analytics materialized views to be
 * rebuilt for the entire database, on every single save. That work still
 * happens, but:
 *   - runAfterResponse() hands it to Next's after(), so the save returns as
 *     soon as the marks are stored. Cache revalidations made inside after()
 *     are still executed by Next (withExecuteRevalidates).
 *   - runCoalesced() collapses a burst into at most one run in flight plus
 *     one follow-up: ten saves in a row on the same exam cost two
 *     recomputes, not ten.
 *
 * Outside a Next request (Vitest, scripts) after() throws, so the task runs
 * inline and its errors propagate — tests keep their synchronous semantics.
 */
import { after } from "next/server";

export async function runAfterResponse(label: string, task: () => Promise<void>): Promise<void> {
  let scheduled = false;
  try {
    after(async () => {
      try {
        await task();
      } catch (err) {
        console.error(`[after:${label}]`, err);
      }
    });
    scheduled = true;
  } catch {
    // No request scope — fall through and run inline.
  }
  if (!scheduled) await task();
}

const inflight = new Map<string, { again: boolean }>();

/** While a run for `key` is in flight, further calls only mark it dirty;
 *  the running loop then goes round once more, so the last write is always
 *  reflected. */
export async function runCoalesced(key: string, task: () => Promise<void>): Promise<void> {
  const current = inflight.get(key);
  if (current) {
    current.again = true;
    return;
  }
  const state = { again: false };
  inflight.set(key, state);
  try {
    do {
      state.again = false;
      await task();
    } while (state.again);
  } finally {
    inflight.delete(key);
  }
}
