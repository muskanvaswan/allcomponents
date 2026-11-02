import { readFile } from "node:fs/promises";
import path from "node:path";

// The agent skill, served from the site so it installs with `npx skills add <site>/skill` (the skills CLI accepts
// a direct link to a SKILL.md). The file itself lives at skills/allcomps/SKILL.md.
async function skill() {
  // Cached, so the route is built once into a static file rather than reading the file on every request.
  "use cache";
  return readFile(path.join(process.cwd(), "skills", "allcomps", "SKILL.md"), "utf8");
}

export async function GET() {
  return new Response(await skill(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
