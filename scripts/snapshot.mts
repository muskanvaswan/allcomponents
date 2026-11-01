// Prepares the collection for a deploy. Builds any preview that's missing or out of
// date, stores every preview compressed, then writes a compact copy of the database
// to data/snapshot.db: only libraries that finished indexing, and none of the
// build-time caches. Production serves that copy, read-only (READ_ONLY in
// src/lib/db.ts). Run it after adding libraries and before deploying:
//
//   npm run snapshot
import { rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { componentDates, db, getComponent, getLibrary, packStoredPreviews, SNAPSHOT_PATH } from "../src/lib/db";
import { hasCurrentPreview, previewFor } from "../src/lib/preview";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const stale = componentDates().filter((c) => !hasCurrentPreview(c.id));
if (stale.length) console.log(`Building ${stale.length} ${stale.length === 1 ? "preview" : "previews"}…`);
for (const { id } of stale) {
  const c = getComponent(id)!;
  const r = await previewFor(c, getLibrary(c.libraryId)!, { rebuild: true });
  console.log(`  ${id}: ${r.ok ? "ok" : `failed (${r.error})`}`);
}

const packed = packStoredPreviews();
if (packed) console.log(`Compressed ${packed} stored previews.`);

rmSync(SNAPSHOT_PATH, { force: true });
db().exec(`VACUUM INTO '${SNAPSHOT_PATH.replaceAll("'", "''")}'`);
const snapshot = new DatabaseSync(SNAPSHOT_PATH);
snapshot.exec(`
  PRAGMA foreign_keys = ON;
  DELETE FROM components_fts WHERE id IN (SELECT c.id FROM components c JOIN libraries l ON l.id = c.library_id WHERE l.status != 'ready');
  DELETE FROM libraries WHERE status != 'ready';
  DELETE FROM assets;
  VACUUM;
`);
const counts = snapshot.prepare("SELECT (SELECT COUNT(*) FROM libraries) AS libraries, (SELECT COUNT(*) FROM components) AS components").get()!;
snapshot.close();
console.log(`Wrote ${SNAPSHOT_PATH}: ${counts.libraries} libraries, ${counts.components} components, ${mb(statSync(SNAPSHOT_PATH).size)}.`);
