"use client";

import { useActionState } from "react";
import { submitLibraryAction, type SubmitState } from "@/app/actions";

const EXAMPLES = ["https://magicui.design/docs/components", "https://easyui.site/components", "https://www.pinui.xyz/components"];

export function SubmitForm({ existing = [] }: { existing?: string[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitLibraryAction, null);
  const examples = EXAMPLES.filter((e) => !existing.some((x) => x.replace(/\/$/, "") === e));
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="library-url" className="block text-[14px] font-semibold">
        Library URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="library-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          required
          placeholder="https://magicui.design/docs/components"
          className="min-w-0 flex-1 rounded-xl bg-fill px-3.5 py-2.5 text-[15px] transition-shadow placeholder:text-muted focus:bg-surface focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none"
        />
        <button type="submit" disabled={pending} className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60">
          {pending ? "Adding…" : "Add library"}
        </button>
      </div>
      <p className="text-[14px] text-muted">
        Use the page that lists the library&apos;s components, its GitHub repo, or its <code className="font-mono text-[13px]">registry.json</code>. Separate several URLs with spaces.
      </p>
      {state && <p className={`text-[14px] ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</p>}
      {examples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 text-[14px]">
          <span className="text-muted">Try:</span>
          {examples.map((e) => (
            <button
              key={e}
              type="submit"
              name="url"
              value={e}
              formNoValidate
              disabled={pending}
              className="rounded-full bg-fill px-3 py-1 transition-colors hover:bg-fill-strong"
            >
              {new URL(e).hostname.replace(/^www\./, "")}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
