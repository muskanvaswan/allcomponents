"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { deleteLibrary, getLibrary, READ_ONLY, setComponentCategory } from "@/lib/db";
import { ingestLibrary, submitLibrary } from "@/lib/ingest";
import { CATEGORY_BY_ID } from "@/lib/taxonomy";

export type SubmitState = { ok: boolean; message: string } | null;

// The read-only site hides the controls for these, but the actions themselves
// can still be called directly, so each one checks too.

export async function submitLibraryAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  if (READ_ONLY) return { ok: false, message: "This site is read-only, so libraries can't be added here." };
  const urls = String(formData.get("url") ?? "")
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return { ok: false, message: "Paste the URL of a component library." };
  const added: string[] = [];
  for (const raw of urls) {
    try {
      const lib = submitLibrary(raw);
      added.push(lib.name);
      after(() => ingestLibrary(lib.id));
    } catch {
      return { ok: false, message: `“${raw}” isn't a valid URL.` };
    }
  }
  refresh();
  return { ok: true, message: `Indexing ${added.join(", ")}…` };
}

export async function refreshLibraryAction(slug: string) {
  if (READ_ONLY) return;
  const lib = getLibrary(slug);
  if (!lib) return;
  after(() => ingestLibrary(lib.id));
  refresh();
}

export async function deleteLibraryAction(slug: string) {
  if (READ_ONLY) return;
  const lib = getLibrary(slug);
  if (lib) deleteLibrary(lib.id);
  refresh();
}

export async function setCategoryAction(id: string, category: string) {
  if (READ_ONLY || !CATEGORY_BY_ID.has(category)) return;
  setComponentCategory(id, category);
  refresh();
}
