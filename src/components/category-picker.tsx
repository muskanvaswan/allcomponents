"use client";

import { useTransition } from "react";
import { setCategoryAction } from "@/app/actions";

export function CategoryPicker({ id, current, options }: { id: string; current: string; options: { id: string; label: string; group: string }[] }) {
  const [pending, start] = useTransition();
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      Filed under the wrong category?
      <select
        defaultValue={current}
        disabled={pending}
        onChange={(e) => start(() => setCategoryAction(id, e.target.value))}
        className="rounded-lg bg-fill px-2 py-1 text-ink"
      >
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
