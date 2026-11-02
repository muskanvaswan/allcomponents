import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { libraryRank } from "./site";
import type { Component, ComponentSummary, Library, LibraryStatus, RepoRef } from "./types";

/**
 * Production serves a snapshot of the collection that nobody can change: libraries
 * are added locally and the snapshot is redeployed (scripts/snapshot.mts). That
 * suits hosts without a lasting writable disk, like Vercel. On a server that has
 * one, ALLOW_WRITES=1 turns adding and editing back on.
 */
export const READ_ONLY = process.env.NODE_ENV === "production" && process.env.ALLOW_WRITES !== "1";

/** The compact, read-only copy of the database that production serves. */
export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "snapshot.db");

const DB_PATH = process.env.UI_AGG_DB ?? (READ_ONLY ? SNAPSHOT_PATH : path.join(process.cwd(), "data", "aggregator.db"));

// Rollback-journal mode rather than WAL: scripts that open the database while the
// dev server is running (scripts/*.mts) can otherwise delete the WAL out from under it.
const SCHEMA = `
PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 10000;

CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  homepage TEXT,
  description TEXT,
  strategy TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress TEXT,
  error TEXT,
  warnings TEXT NOT NULL DEFAULT '[]',
  component_count INTEGER NOT NULL DEFAULT 0,
  frameworks TEXT NOT NULL DEFAULT '[]',
  repo TEXT,
  created_at TEXT NOT NULL,
  ingested_at TEXT
);

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  categories TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  category_source TEXT NOT NULL DEFAULT 'heuristic',
  framework TEXT,
  styling TEXT,
  animated INTEGER NOT NULL DEFAULT 0,
  dependencies TEXT NOT NULL DEFAULT '[]',
  registry_dependencies TEXT NOT NULL DEFAULT '[]',
  install_command TEXT,
  docs_url TEXT,
  source_url TEXT,
  preview_image TEXT,
  item_url TEXT,
  files TEXT NOT NULL DEFAULT '[]',
  example TEXT,
  styles TEXT,
  variants TEXT NOT NULL DEFAULT '[]',
  kind TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS components_category ON components(category);
CREATE INDEX IF NOT EXISTS components_library ON components(library_id);

CREATE TABLE IF NOT EXISTS previews (
  component_id TEXT PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  html TEXT,
  error TEXT,
  built_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS components_fts USING fts5(
  id UNINDEXED, name, description, tags, category, library,
  tokenize = 'porter unicode61'
);
`;

type Global = typeof globalThis & { __uiAggDb?: DatabaseSync };

export function db(): DatabaseSync {
  const g = globalThis as Global;
  if (!g.__uiAggDb && READ_ONLY) g.__uiAggDb = new DatabaseSync(DB_PATH, { readOnly: true });
  if (!g.__uiAggDb) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec(SCHEMA);
    // A server restart kills in-flight ingestion jobs; don't leave them spinning forever.
    conn
      .prepare("UPDATE libraries SET status = 'error', error = 'Interrupted by a server restart. Refresh to retry.', progress = NULL WHERE status IN ('pending', 'ingesting')")
      .run();
    g.__uiAggDb = conn;
  }
  return g.__uiAggDb;
}

type Row = Record<string, unknown>;

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string" || !v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

const str = (v: unknown) => (v == null ? null : String(v));

function toLibrary(r: Row): Library {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    url: String(r.url),
    homepage: str(r.homepage),
    description: str(r.description),
    strategy: str(r.strategy),
    status: r.status as LibraryStatus,
    progress: str(r.progress),
    error: str(r.error),
    warnings: json<string[]>(r.warnings, []),
    componentCount: Number(r.component_count ?? 0),
    frameworks: json<string[]>(r.frameworks, []),
    repo: json<RepoRef | null>(r.repo, null),
    createdAt: String(r.created_at),
    ingestedAt: str(r.ingested_at),
  };
}

function toComponent(r: Row): Component {
  return {
    id: String(r.id),
    libraryId: Number(r.library_id),
    librarySlug: String(r.library_slug),
    libraryName: String(r.library_name),
    slug: String(r.slug),
    name: String(r.name),
    description: str(r.description),
    category: String(r.category),
    categories: json<string[]>(r.categories, []),
    tags: json<string[]>(r.tags, []),
    confidence: Number(r.confidence ?? 0),
    categorySource: r.category_source === "manual" ? "manual" : "heuristic",
    framework: str(r.framework),
    styling: str(r.styling),
    animated: Boolean(r.animated),
    dependencies: json<string[]>(r.dependencies, []),
    registryDependencies: json<string[]>(r.registry_dependencies, []),
    installCommand: str(r.install_command),
    docsUrl: str(r.docs_url),
    sourceUrl: str(r.source_url),
    previewImage: str(r.preview_image),
    itemUrl: str(r.item_url),
    files: json(r.files, []),
    example: json(r.example, null),
    styles: json(r.styles, null),
    variants: json<string[]>(r.variants, []),
    kind: str(r.kind),
    updatedAt: String(r.updated_at),
  };
}

export function toSummary(c: Component): ComponentSummary {
  const { id, libraryId, librarySlug, libraryName, slug, name, description, category, categories, framework, animated, docsUrl, previewImage, dependencies, kind } = c;
  return { id, libraryId, librarySlug, libraryName, slug, name, description, category, categories, framework, animated, docsUrl, previewImage, dependencies, kind };
}

const COMPONENT_SELECT = `
  SELECT c.*, l.slug AS library_slug, l.name AS library_name
  FROM components c JOIN libraries l ON l.id = c.library_id`;

// ---- libraries ----

/** Libraries in the site's chosen order (LIBRARY_ORDER), then any others newest first. */
export function listLibraries(): Library[] {
  const newestFirst = db().prepare("SELECT * FROM libraries ORDER BY created_at DESC").all().map(toLibrary);
  // The sort is stable, so libraries that aren't in the list keep their newest-first order after the rest.
  return newestFirst.sort((a, b) => libraryRank(a.slug) - libraryRank(b.slug));
}

export function getLibrary(idOrSlug: number | string): Library | null {
  const row =
    typeof idOrSlug === "number"
      ? db().prepare("SELECT * FROM libraries WHERE id = ?").get(idOrSlug)
      : db().prepare("SELECT * FROM libraries WHERE slug = ? OR url = ?").get(idOrSlug, idOrSlug);
  return row ? toLibrary(row) : null;
}

export function createLibrary(input: { url: string; slug: string; name: string }): Library {
  const existing = getLibrary(input.url);
  if (existing) return existing;
  let slug = input.slug;
  for (let i = 2; db().prepare("SELECT 1 FROM libraries WHERE slug = ?").get(slug); i++) slug = `${input.slug}-${i}`;
  db()
    .prepare("INSERT INTO libraries (slug, name, url, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .run(slug, input.name, input.url, new Date().toISOString());
  return getLibrary(slug)!;
}

type LibraryPatch = Partial<
  Pick<Library, "name" | "homepage" | "description" | "strategy" | "status" | "progress" | "error" | "warnings" | "componentCount" | "frameworks" | "repo" | "ingestedAt">
>;

const LIBRARY_COLUMNS: Record<keyof LibraryPatch, string> = {
  name: "name",
  homepage: "homepage",
  description: "description",
  strategy: "strategy",
  status: "status",
  progress: "progress",
  error: "error",
  warnings: "warnings",
  componentCount: "component_count",
  frameworks: "frameworks",
  repo: "repo",
  ingestedAt: "ingested_at",
};

export function updateLibrary(id: number, patch: LibraryPatch) {
  const keys = (Object.keys(patch) as (keyof LibraryPatch)[]).filter((k) => patch[k] !== undefined);
  if (!keys.length) return;
  const values = keys.map((k) => {
    const v = patch[k];
    if (v === null) return null;
    return typeof v === "object" ? JSON.stringify(v) : (v as string | number);
  });
  db()
    .prepare(`UPDATE libraries SET ${keys.map((k) => `${LIBRARY_COLUMNS[k]} = ?`).join(", ")} WHERE id = ?`)
    .run(...values, id);
}

export function deleteLibrary(id: number) {
  const conn = db();
  conn.exec("BEGIN");
  try {
    conn.prepare("DELETE FROM components_fts WHERE id IN (SELECT id FROM components WHERE library_id = ?)").run(id);
    conn.prepare("DELETE FROM libraries WHERE id = ?").run(id);
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

// ---- components ----

export type ComponentInput = Omit<Component, "libraryId" | "librarySlug" | "libraryName" | "updatedAt" | "categorySource"> & {
  categorySource?: Component["categorySource"];
};

/** Replaces a library's components in one transaction, keeping any manual category fixes. */
export function replaceComponents(library: Library, components: ComponentInput[]) {
  const conn = db();
  const manual = new Map(
    conn
      .prepare("SELECT id, category FROM components WHERE library_id = ? AND category_source = 'manual'")
      .all(library.id)
      .map((r) => [String(r.id), String(r.category)]),
  );
  const now = new Date().toISOString();
  const insert = conn.prepare(`
    INSERT INTO components (id, library_id, slug, name, description, category, categories, tags, confidence, category_source,
      framework, styling, animated, dependencies, registry_dependencies, install_command, docs_url, source_url, preview_image,
      item_url, files, example, styles, variants, kind, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertFts = conn.prepare("INSERT INTO components_fts (id, name, description, tags, category, library) VALUES (?, ?, ?, ?, ?, ?)");

  conn.exec("BEGIN");
  try {
    conn.prepare("DELETE FROM components_fts WHERE id IN (SELECT id FROM components WHERE library_id = ?)").run(library.id);
    conn.prepare("DELETE FROM components WHERE library_id = ?").run(library.id);
    for (const c of components) {
      const manualCategory = manual.get(c.id);
      const category = manualCategory ?? c.category;
      insert.run(
        c.id, library.id, c.slug, c.name, c.description, category, JSON.stringify(c.categories), JSON.stringify(c.tags), c.confidence,
        manualCategory ? "manual" : "heuristic", c.framework, c.styling, c.animated ? 1 : 0, JSON.stringify(c.dependencies),
        JSON.stringify(c.registryDependencies), c.installCommand, c.docsUrl, c.sourceUrl, c.previewImage, c.itemUrl,
        JSON.stringify(c.files), c.example ? JSON.stringify(c.example) : null, c.styles ? JSON.stringify(c.styles) : null,
        JSON.stringify(c.variants), c.kind, now,
      );
      insertFts.run(c.id, c.name, c.description ?? "", c.tags.join(" "), `${category} ${c.categories.join(" ")}`, library.name);
    }
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export function getComponent(id: string): Component | null {
  const row = db().prepare(`${COMPONENT_SELECT} WHERE c.id = ?`).get(id);
  return row ? toComponent(row) : null;
}

/** Every npm dependency the library's components declare, versioned ones first. */
export function libraryDependencies(libraryId: number): string[] {
  const rows = db().prepare("SELECT dependencies FROM components WHERE library_id = ?").all(libraryId);
  const all = new Set(rows.flatMap((r) => json<string[]>(r.dependencies, [])));
  return [...all].sort((a, b) => Number(/.@/.test(b)) - Number(/.@/.test(a)));
}

/** Every component's id and when it last changed, for the sitemap. */
export function componentDates(): { id: string; updatedAt: string }[] {
  return db()
    .prepare("SELECT id, updated_at FROM components ORDER BY id")
    .all()
    .map((r) => ({ id: String(r.id), updatedAt: String(r.updated_at) }));
}

/** Persists source fetched on demand, so the next visit is instant. A read-only snapshot skips it. */
export function saveComponentSource(id: string, patch: Pick<Component, "files" | "example" | "styles" | "dependencies" | "registryDependencies">) {
  if (READ_ONLY) return;
  db()
    .prepare("UPDATE components SET files = ?, example = ?, styles = ?, dependencies = ?, registry_dependencies = ? WHERE id = ?")
    .run(
      JSON.stringify(patch.files),
      patch.example ? JSON.stringify(patch.example) : null,
      patch.styles ? JSON.stringify(patch.styles) : null,
      JSON.stringify(patch.dependencies),
      JSON.stringify(patch.registryDependencies),
      id,
    );
}

export function setComponentCategory(id: string, category: string) {
  const conn = db();
  conn.prepare("UPDATE components SET category = ?, category_source = 'manual' WHERE id = ?").run(category, id);
  conn.prepare("UPDATE components_fts SET category = ? WHERE id = ?").run(category, id);
}

const SUMMARY_SELECT = `
  SELECT c.id, c.library_id, c.slug, c.name, c.description, c.category, c.categories, c.framework, c.animated, c.docs_url,
    c.preview_image, c.dependencies, c.kind, l.slug AS library_slug, l.name AS library_name
  FROM components c JOIN libraries l ON l.id = c.library_id`;

/** Light rows for grids and search results; skips the (possibly large) source columns. */
export function summariesByIds(ids: string[]): ComponentSummary[] {
  if (!ids.length) return [];
  const rows = db().prepare(`${SUMMARY_SELECT} WHERE c.id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  const byId = new Map(rows.map((r) => [String(r.id), toSummary(toComponent(r))]));
  return ids.map((id) => byId.get(id)).filter((c): c is ComponentSummary => Boolean(c));
}

export function componentsByIds(ids: string[]): Component[] {
  if (!ids.length) return [];
  const rows = db().prepare(`${COMPONENT_SELECT} WHERE c.id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  const byId = new Map(rows.map((r) => [String(r.id), toComponent(r)]));
  return ids.map((id) => byId.get(id)).filter((c): c is Component => Boolean(c));
}

/** `library` is one library slug, or several separated by commas. */
export type Filters = { category?: string; library?: string; framework?: string; animated?: boolean };

function filterSql(f: Filters, params: (string | number)[]) {
  const where: string[] = [];
  if (f.category) {
    where.push("(c.category = ? OR c.categories LIKE ?)");
    params.push(f.category, `%"${f.category}"%`);
  }
  const slugs = f.library?.split(",").filter(Boolean) ?? [];
  if (slugs.length) {
    where.push(`l.slug IN (${slugs.map(() => "?").join(", ")})`);
    params.push(...slugs);
  }
  if (f.framework) {
    where.push("c.framework = ?");
    params.push(f.framework);
  }
  if (f.animated) where.push("c.animated = 1");
  return where;
}

/** Full-text candidates with their bm25 rank (lower is better). */
export function ftsCandidates(match: string, f: Filters, limit = 300): { id: string; rank: number }[] {
  const params: (string | number)[] = [match];
  const where = filterSql(f, params);
  params.push(limit);
  return db()
    .prepare(
      `SELECT c.id AS id, bm25(components_fts, 0, 10.0, 2.0, 4.0, 3.0, 1.0) AS rank
       FROM components_fts JOIN components c ON c.id = components_fts.id JOIN libraries l ON l.id = c.library_id
       WHERE components_fts MATCH ? ${where.length ? `AND ${where.join(" AND ")}` : ""}
       ORDER BY rank LIMIT ?`,
    )
    .all(...params)
    .map((r) => ({ id: String(r.id), rank: Number(r.rank) }));
}

export function filteredIds(f: Filters, limit = 5000): string[] {
  const params: (string | number)[] = [];
  const where = filterSql(f, params);
  params.push(limit);
  return db()
    .prepare(
      `SELECT c.id FROM components c JOIN libraries l ON l.id = c.library_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY (c.category = 'other'), c.name COLLATE NOCASE LIMIT ?`,
    )
    .all(...params)
    .map((r) => String(r.id));
}

export function categoryCounts(f: Omit<Filters, "category"> = {}): Map<string, number> {
  const params: (string | number)[] = [];
  const where = filterSql(f, params);
  const rows = db()
    .prepare(
      `SELECT c.category AS category, COUNT(*) AS n FROM components c JOIN libraries l ON l.id = c.library_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY c.category`,
    )
    .all(...params);
  return new Map(rows.map((r) => [String(r.category), Number(r.n)]));
}

export function frameworkCounts(): Map<string, number> {
  const rows = db().prepare("SELECT framework, COUNT(*) AS n FROM components WHERE framework IS NOT NULL GROUP BY framework").all();
  return new Map(rows.map((r) => [String(r.framework), Number(r.n)]));
}

export function totals(): { components: number; libraries: number } {
  const r = db().prepare("SELECT (SELECT COUNT(*) FROM components) AS c, (SELECT COUNT(*) FROM libraries WHERE status = 'ready') AS l").get()!;
  return { components: Number(r.c), libraries: Number(r.l) };
}

// ---- previews ----

// A preview is a few hundred KB of HTML, so it's stored Brotli-compressed (about a
// quarter of the size) as a blob. Previews saved before that are still plain text.
const packHtml = (html: string) => brotliCompressSync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: html.length } });
const unpackHtml = (v: unknown) => (v instanceof Uint8Array ? brotliDecompressSync(v).toString("utf8") : str(v));

export function getPreview(componentId: string): { html: string | null; error: string | null } | null {
  const row = db().prepare("SELECT html, error FROM previews WHERE component_id = ?").get(componentId);
  return row ? { html: unpackHtml(row.html), error: str(row.error) } : null;
}

/** Stores a built preview. A read-only snapshot skips it: the preview is rebuilt next time instead. */
export function savePreview(componentId: string, html: string | null, error: string | null) {
  if (READ_ONLY) return;
  db()
    .prepare("INSERT OR REPLACE INTO previews (component_id, html, error, built_at) VALUES (?, ?, ?, ?)")
    .run(componentId, html == null ? null : packHtml(html), error, new Date().toISOString());
}

/** Compresses previews stored before they were kept compressed. Returns how many it packed. */
export function packStoredPreviews(): number {
  const conn = db();
  const rows = conn.prepare("SELECT component_id, html FROM previews WHERE typeof(html) = 'text'").all();
  const update = conn.prepare("UPDATE previews SET html = ? WHERE component_id = ?");
  for (const r of rows) update.run(packHtml(String(r.html)), String(r.component_id));
  return rows.length;
}

// ---- assets (bundled preview runtime and npm packages) ----

export function getAsset(key: string): { content: string; contentType: string } | null {
  const row = db().prepare("SELECT content, content_type FROM assets WHERE key = ?").get(key);
  return row ? { content: String(row.content), contentType: String(row.content_type) } : null;
}

export function saveAsset(key: string, content: string, contentType = "text/javascript; charset=utf-8") {
  if (READ_ONLY) return;
  db()
    .prepare("INSERT OR REPLACE INTO assets (key, content, content_type, created_at) VALUES (?, ?, ?, ?)")
    .run(key, content, contentType, new Date().toISOString());
}
