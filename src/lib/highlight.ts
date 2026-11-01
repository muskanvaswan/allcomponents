import "server-only";
import { createHighlighter, type Highlighter } from "shiki";

const LANGS = ["tsx", "ts", "jsx", "js", "vue", "svelte", "html", "css", "json", "bash"] as const;
let highlighter: Promise<Highlighter> | null = null;

export async function highlight(code: string, filePath: string): Promise<string> {
  highlighter ??= createHighlighter({ themes: ["github-light", "github-dark"], langs: [...LANGS] });
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "tsx";
  const lang = (LANGS as readonly string[]).includes(ext) ? ext : ext === "mjs" || ext === "cjs" ? "js" : "tsx";
  return (await highlighter).codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: "light" });
}
