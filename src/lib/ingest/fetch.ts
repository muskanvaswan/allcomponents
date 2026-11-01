import "server-only";

const USER_AGENT = "lookbook/0.1 (component indexer)";
const MAX_BYTES = 8 * 1024 * 1024;

export class BlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`${new URL(url).hostname} blocks automated access (${reason}).`);
    this.name = "BlockedError";
  }
}

export type FetchResult = { ok: boolean; status: number; url: string; text: string; contentType: string; headers: Headers };

/** Pages served by bot-protection layers instead of the real content. */
function challengeReason(res: Response, text: string): string | null {
  if (res.status !== 403 && res.status !== 429 && res.status !== 503) return null;
  if (/Vercel Security Checkpoint/i.test(text)) return "Vercel Security Checkpoint";
  if (/cf-chl|Just a moment\.\.\.|challenge-platform/i.test(text)) return "Cloudflare challenge";
  if (/captcha/i.test(text)) return "CAPTCHA";
  return null;
}

export async function fetchText(url: string, opts: { accept?: string; timeoutMs?: number; retries?: number } = {}): Promise<FetchResult> {
  const retries = opts.retries ?? 1;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: opts.accept ?? "text/html,application/json;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new Error(`${url} is too large (${length} bytes)`);
    const text = await res.text();
    const blocked = challengeReason(res, text);
    if (blocked) throw new BlockedError(url, blocked);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? 2) * 1000, 10_000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return { ok: res.ok, status: res.status, url: res.url || url, text, contentType: res.headers.get("content-type") ?? "", headers: res.headers };
  }
}

/** Fetches JSON, returning null for non-200s and non-JSON bodies (HTML 404 pages are common). */
export async function fetchJson<T = unknown>(url: string, opts: { timeoutMs?: number } = {}): Promise<T | null> {
  try {
    const res = await fetchText(url, { accept: "application/json", timeoutMs: opts.timeoutMs });
    if (!res.ok) return null;
    const body = res.text.trimStart();
    if (!body.startsWith("{") && !body.startsWith("[")) return null;
    return JSON.parse(body) as T;
  } catch (e) {
    if (e instanceof BlockedError) throw e;
    return null;
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---- robots.txt (only consulted when crawling HTML pages) ----

const robotsCache = new Map<string, Promise<string[]>>();

function disallowRules(origin: string): Promise<string[]> {
  let p = robotsCache.get(origin);
  if (!p) {
    p = fetchText(`${origin}/robots.txt`, { accept: "text/plain", timeoutMs: 8000, retries: 0 })
      .then((res) => (res.ok ? parseRobots(res.text) : []))
      .catch(() => []);
    robotsCache.set(origin, p);
  }
  return p;
}

function parseRobots(text: string): string[] {
  const rules: string[] = [];
  let applies = false;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    if (/^user-agent$/i.test(key)) {
      if (sawRule) applies = false;
      sawRule = false;
      if (value === "*" || /lookbook/i.test(value)) applies = true;
    } else {
      sawRule = true;
      if (applies && /^disallow$/i.test(key) && value) rules.push(value);
    }
  }
  return rules;
}

export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  const rules = await disallowRules(u.origin);
  const target = u.pathname + u.search;
  return !rules.some((rule) => {
    const pattern = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pattern.endsWith("\\$") ? pattern.slice(0, -2) + "$" : pattern}`).test(target);
  });
}
