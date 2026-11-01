import "server-only";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

/**
 * Compiles the Tailwind CSS a preview needs on the server: scans its source
 * files for class names and builds only those utilities, plus `css` (theme
 * tokens, keyframes, registry styles). Replaces running Tailwind in the browser.
 */
export async function compileTailwind(files: { path: string; content: string }[], css: string): Promise<string> {
  const compiler = await compile(`@import "tailwindcss";\n${css}`, { base: process.cwd(), onDependency() {} });
  const scanner = new Scanner({});
  const candidates = scanner.scanFiles(files.map((f) => ({ content: f.content, extension: f.path.split(".").pop() ?? "tsx" })));
  return compiler.build(candidates);
}
