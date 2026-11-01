// Ingests the given URLs from the command line: `npm run ingest -- <url> [url...]`.
import { listLibraries } from "../src/lib/db";
import { ingestLibrary, submitLibrary } from "../src/lib/ingest";

for (const url of process.argv.slice(2)) {
  const lib = submitLibrary(url);
  const started = Date.now();
  await ingestLibrary(lib.id);
  const after = listLibraries().find((l) => l.id === lib.id)!;
  console.log(`${after.name} [${after.status}] ${after.componentCount} components via ${after.strategy} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (after.error) console.log(`  error: ${after.error}`);
  for (const w of after.warnings) console.log(`  warning: ${w}`);
}
