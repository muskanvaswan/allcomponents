import { connection, type NextRequest } from "next/server";
import { catalogue, componentSource, findAlternatives, originFrom } from "@/lib/agent";
import { SITE_NAME } from "@/lib/site";

// A Model Context Protocol server over Streamable HTTP, so an agent can search
// the collection with tools instead of URLs:
//   claude mcp add --transport http components http://localhost:3100/mcp
// It's stateless and answers each JSON-RPC request with plain JSON (no SSE
// stream, no sessions), which is all read-only tools need.

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const LIMIT = { type: "integer", minimum: 1, maximum: 24, description: "How many results to return (default 8)." };
const LIBRARY = { type: "string", description: 'Only these libraries: one slug or several comma-separated, like "magicui,easyui". See list_categories.' };

const TOOLS = [
  {
    name: "find_components",
    title: "Find components",
    description:
      'Search every UI library in the collection for components that fit a need, described in words ("animated pricing table", "date picker", "marquee of logos"). Results come from several libraries, each with an install command, the registry item URL holding its source, its npm dependencies, and a live preview link to show a person.',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the component should be or do." },
        category: { type: "string", description: 'A category id, like "button" or "carousel". See list_categories.' },
        library: LIBRARY,
        limit: LIMIT,
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "component_alternatives",
    title: "Component alternatives",
    description:
      "Other libraries' takes on a component you already have: the same kind of component from the rest of the collection, other libraries first. Use it to offer choices or to swap a component for one that fits better.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: 'The component id from a result, like "magicui/marquee".' },
        library: LIBRARY,
        limit: LIMIT,
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "get_component",
    title: "Get component source",
    description: "One component's full source files, install command and dependencies, to read or adapt it before installing.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: 'The component id from a result, like "magicui/marquee".' } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "list_categories",
    title: "List categories and libraries",
    description: "The categories and libraries in the collection, with how many components each holds. Use the ids to narrow the other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

async function callTool(name: string, args: Record<string, unknown>, origin: string): Promise<object> {
  switch (name) {
    case "find_components":
      return findAlternatives({ query: str(args.query), category: str(args.category), library: str(args.library), limit: num(args.limit) }, origin);
    case "component_alternatives":
      return findAlternatives({ for: str(args.id) ?? "", library: str(args.library), limit: num(args.limit) }, origin);
    case "get_component":
      return componentSource(str(args.id) ?? "", origin);
    case "list_categories":
      return catalogue();
    default:
      return { error: `Unknown tool "${name}".` };
  }
}

async function handle(msg: Rpc, origin: string): Promise<object | null> {
  const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  // Notifications (no id) get no response.
  if (msg.id === undefined || msg.id === null) return null;
  switch (msg.method) {
    case "initialize": {
      const asked = str(msg.params?.protocolVersion);
      return reply({
        protocolVersion: asked && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "components", title: SITE_NAME, version: "1.0.0" },
        instructions:
          `${SITE_NAME} is an aggregator of components from many UI libraries. Use find_components to find candidates for a need and component_alternatives to compare a component with other libraries' versions. Show people the preview link before choosing; install with the install command.`,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = str(msg.params?.name) ?? "";
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool "${name}".`);
      const result = await callTool(name, (msg.params?.arguments as Record<string, unknown>) ?? {}, origin);
      return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: "error" in result });
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: NextRequest) {
  await connection();
  // Browsers send Origin; refuse other sites so a web page can't drive this server (DNS rebinding).
  const from = req.headers.get("origin");
  if (from && (from === "null" || URL.parse(from)?.host !== req.headers.get("host"))) return new Response("Forbidden", { status: 403 });

  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const origin = originFrom(req.headers);
  const replies = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => handle(m, origin)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

// No server-initiated stream and no sessions to end.
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
export const DELETE = GET;
