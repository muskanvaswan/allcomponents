import { connection, type NextRequest } from "next/server";
import { catalogue, originFrom } from "@/lib/agent";
import { SITE_NAME } from "@/lib/site";

/** How an agent should use this aggregator, in the llms.txt convention: plain Markdown at a known address. */
export async function GET(req: NextRequest) {
  await connection();
  const origin = originFrom(req.headers);
  const { categories, libraries } = catalogue();
  const total = libraries.reduce((n, l) => n + l.components, 0);

  const text = `# ${SITE_NAME}

> An aggregator of UI components: ${total} components from ${libraries.length} libraries (${libraries.map((l) => l.name).join(", ")}), each filed under a category, with a live preview and a shadcn-compatible install command. Use it to find a component for a need, or to compare a component with other libraries' versions before choosing.

## For agents

The quickest way in is the MCP server. In Claude Code:

    claude mcp add --transport http components ${origin}/mcp

Its tools: \`find_components\` (search by need), \`component_alternatives\` (other libraries' versions of a component), \`get_component\` (full source) and \`list_categories\`.

Without MCP, the same answers are plain JSON:

- [Find components for a need](${origin}/api/alternatives?query=animated+pricing+table): \`GET /api/alternatives?query=<what you need>\`
- [Alternatives to a component](${origin}/api/alternatives?for=magicui/marquee): \`GET /api/alternatives?for=<component id>\`
- Both take \`category=<id>\`, \`library=<slug>[,<slug>]\` and \`limit=<1-24>\` (default 8).
- [One component with its source](${origin}/r/magicui--marquee.json): \`GET /r/<library>--<component>.json\`, a shadcn registry item.
- [Every component](${origin}/r/registry.json): \`GET /r/registry.json\`

Each result has an \`id\`, \`name\`, \`library\`, \`category\`, \`description\`, \`dependencies\`, an \`install\` command (\`npx shadcn@latest add …\`), the \`registryItem\` URL holding its source, and \`preview\` and \`page\` links. Show a person the preview before choosing for them.

## Categories

${categories.map((c) => `- \`${c.id}\`: ${c.label} (${c.components})`).join("\n")}

## Libraries

${libraries.map((l) => `- \`${l.slug}\`: [${l.name}](${l.url}) (${l.components})`).join("\n")}
`;
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
