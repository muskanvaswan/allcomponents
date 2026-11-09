# Components

An aggregator of UI components: one searchable, categorised collection of components pulled from many component libraries. Paste a library's URL; it finds the library's components, files each one under a category (buttons, carousels, backgrounds, pricing sections…), and shows them side by side with a live preview and a link back to the original page.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, go to **Add a library**, and paste a link such as `https://magicui.design/docs/components` or `https://easyui.site/components`. Indexing runs in the background; the page updates when it finishes.

From the command line:

```bash
npm run ingest -- https://magicui.design/docs/components
```

The look is defined in `design-system/lookbook/MASTER.md`: Apple's design language with a pale blue accent.

Data lives in `data/aggregator.db` (SQLite through Node's built-in `node:sqlite`, so Node 22.13+ is required). Set `UI_AGG_DB` to put it elsewhere, and `GITHUB_TOKEN` to raise GitHub's API limit when many libraries host their source on GitHub.

## Deploying

The public site is read-only: you add libraries locally, then deploy a snapshot of the collection. Nobody can add, delete or recategorise anything on it, so it suits hosts without a lasting writable disk, such as Vercel's free plan.

1. Add or refresh libraries locally with `npm run dev` or `npm run ingest`.
2. Run `npm run snapshot`. It builds any preview that's missing or out of date, then writes `data/snapshot.db`: a compact copy (about 33 MB) with only the libraries that finished indexing and none of the build-time caches.
3. Commit `data/snapshot.db` (it's the one file in `data/` that git tracks) and deploy.

A production build (`NODE_ENV=production`) opens the snapshot read-only and ships it with every route (`outputFileTracingIncludes` in `next.config.ts`). The editing controls are hidden, the server actions do nothing, and `POST /api/libraries` returns 403. Previews come from the snapshot and can be cached by a CDN for a day.

On Vercel: import the repo (or run `vercel` from this folder; `.vercelignore` uploads the snapshot but not the working copy). Node 24 is set in `package.json`. Set `SITE_URL` to the site's address, such as `https://components.example.com`, once it has a custom domain; until then the project's production `vercel.app` domain is used for canonical links, the sitemap and link previews. Vercel's free plan is for non-commercial use.

To run the full app on a server with a disk instead, set `ALLOW_WRITES=1` and point `UI_AGG_DB` at a database on that disk. The editing actions have no login, so don't do that on a public address.

## Search engines

Every page has a title, a description and a canonical address. Category and library views (`/?category=button`, `/?library=magicui`) get their own, and searches (`?q=`) are marked noindex. Component pages also carry schema.org `SoftwareSourceCode` and breadcrumb data, and the home page a `WebSite` entry. `/sitemap.xml` lists the home page, every category and library, and every component. `/robots.txt` keeps crawlers out of the JSON endpoints, the MCP server, the registry and the bare previews (which also send `X-Robots-Tag: noindex`). Link previews use a generated image in the site's dark mode (`src/app/opengraph-image.tsx`), set in the site's own fonts, which it fetches from Google Fonts once per build (it falls back to a plain face if they can't be reached). The icons are drawn in `src/components/app-mark.tsx` at 48, 96, 192 and 512px (search results want a multiple of 48), plus a 180px Apple icon, and `/manifest.webmanifest` names the site for home screens. The name, description and keywords live in `src/lib/site.ts`; the layout also lets search engines show the share image large.

## How a library gets in

`src/lib/ingest/` tries, in order:

1. **A shadcn registry.** Most modern libraries publish one. It's found through the public directory at `ui.shadcn.com/r/registries.json`, `registry.json` / `r/registry.json` probes (and shadcn/ui's own `r/styles/<style>/registry.json`), or `npx shadcn add …` URLs on the page. A directory entry only counts when the submitted page sits under its homepage, since one site can host several registries: `ui.shadcn.com/oidc` is a separate registry of OIDC forms, not shadcn/ui. The registry gives names, descriptions, dependencies, and per-item JSON with the full source. If there's no per-item JSON, source files are read from the library's GitHub repo. A registry can also be submitted by its raw GitHub URL (`https://raw.githubusercontent.com/<owner>/<repo>/main/public/r/{name}.json`); it's then named after the repo, with the repo as its homepage. A registry's own stylesheets (Board UI's `theme`, `typography` and `globals`) are saved with the library, so its previews get its theme tokens.
2. **The GitHub repo**, for a GitHub link with no registry in it (`src/lib/ingest/repo.ts`). Many libraries are their own docs site and keep a catalogue of their components in code: an array of entries with a slug, name, description, category and file names, like Pin UI's `components/library/registry.ts`. When a repo has one, exactly what it lists is indexed, along with poster images from `public/`. Without one, each component file in a component folder (`components/`, `ui/`, `library/`…) becomes an entry named after the file. Package versions come from `package.json`. Docs links come from the site's own component route (for example `app/components/[slug]/page.tsx` plus the repo's homepage).
3. **The docs site.** Without a registry, it reads `llms.txt`, the sitemap, and links under the submitted path. It then crawls each component page (respecting `robots.txt`) for its title, description, preview image and code samples.

In every case each component is linked to its original docs page.

**Only free components.** A library that sells part of its collection often marks each item "(free)" or "(pro)" in its `llms.txt` (`src/lib/ingest/tiers.ts`). When it does, only the items marked free are gathered, even when its registry serves the paid ones to anyone: a registry leaves the rest out before reading them. VantaUI, for one, has 17 free components out of about 200.

A registry file submitted directly (as VantaUI's `r/registry.json` on its own Vercel domain) takes its name and description from the homepage the registry names. When a registry item has no separate demo but its `docs` notes include a TSX example that default-exports a page, that example is used as the demo.

Sites behind bot protection (for example Vercel's Security Checkpoint) are marked **blocked** rather than worked around. Submit their GitHub repo or `registry.json` URL instead.

## Categories

`src/lib/taxonomy.ts` holds about 70 categories in 12 groups. A keyword classifier scores the component's name, path and registry hints, and description against each one. The name carries the most weight, and broad buckets are down-weighted so specific ones win. A name that says "chart" is filed under Charts alone, since its other words describe the chart ("Chart Bar Label" isn't a form). A wrong category can be fixed from the component page; manual fixes survive re-indexing.

## Live previews

`src/lib/preview.ts` turns each component into one self-contained HTML document, built the first time it's viewed and then cached in SQLite, Brotli-compressed:

- **Code:** the component, plus its demo when the library ships one, is bundled with esbuild. A demo that's a whole page (a `<main>`, or anything screen-tall) fills the preview rather than being centred and padded. Files an item ships to `public/` load from its registry's own site. A block that ships its own page (shadcn's `registry:page`, as sidebars and dashboards do) is shown as that page, since the page sets up what its parts need. If a demo imports the library's own modules that can't be found (say, a demo written for another of its styles), the component is shown without it. A registry item's demo can also be code in its `meta.example` (Board UI ships them that way), or a `demo.tsx` filed in a folder named for the component (Rare UI's `app/components/(docs)/gooeynav/demo.tsx`). Imports between the library's own files are resolved from the registry (sibling items named by an import's last segment, like Magic UI's `@/registry/magicui/tweet-card` or Board UI's `@/utils/cx`, and bare registry dependencies from the library's own registry before shadcn/ui's), the GitHub repo, or shadcn/ui primitives, and Next.js-only modules (`next/link`, `next/image`, …) are shimmed. A demo that pulls its example out of a lookup table (EasyUI's `DEMO_COMPONENTS`) is followed through the table's `import()` to the real file. Demos found in a monorepo resolve `@/` against their own app's folder, and of shadcn/ui's per-library copies of a demo, the Radix one is preferred, since its registry components are built on Radix. If a demo crashes, the preview falls back to the bare component, wrapped in its own `<Name>Provider` when the module has one. Like an app built with shadcn/ui, a preview that uses its tooltip is wrapped in a `TooltipProvider`.
- **npm packages:** bundled into the same script. React comes from this app's `node_modules`, picked by file so the scripts (which run with `--conditions=react-server`) still get the browser build; other packages are fetched once from esm.sh and stored (`src/lib/vendor.ts`). For `lucide-react` and `radix-ui`, only the icons and primitives a component imports are included. A package that doesn't use React (per its `package.json`) is loaded from esm.sh's plain build, the same one esm.sh's own builds import, so it isn't loaded twice. A package a component imports without declaring it gets the version its library declares elsewhere. `react-aria-components` is fetched as one bundled module, since esm.sh's split build of React Aria carries two copies of the context that marks its hidden collection pass (a Select's value then renders outside its Select). A file a library's registry publishes wins over the same path in its GitHub repo, which can be out of step. `PREVIEW_MINIFY=0` builds readable previews, for debugging one that crashes. Two more esm.sh quirks are worked around: its builds of zod 4's entry points export only `default` and `z`, so they're rebuilt from `zod/v4/classic/external`, and a stylesheet served as plain CSS under a `.css.mjs` name is bundled as CSS.
- **CSS:** Tailwind compiles on the server from the classes the component uses, together with the registry's keyframes and theme tokens (`src/lib/tailwind.ts`). A component's own stylesheets are bundled in too.
- **Images and sounds:** paths that name files in the library repo's `public/` folder (`"/library/shoe.jpg"`, or a stylesheet's `url(...)`) are pointed at the repo on GitHub, so photos and audio load in the preview.

A card that sets no width of its own (like shadcn's chart demos) gets a comfortable one, so a chart sized to 100% has room. A grid tile renders its preview at twice the tile's size, scaled down, or three times for blocks so they lay out for a desktop window rather than collapsing to mobile. A preview that renders nothing at all reports it, and its tile says there's no live preview.

Apart from those files, a preview page makes no further requests, so it renders as soon as its script runs. It's sent Brotli- or gzip-compressed (about a third of its ~460 KB), compressed once per version and kept in memory. Browsers reuse it for a minute and then revalidate it with an ETag. Previews are served from `/preview/<library>/<component>` with a `Content-Security-Policy: sandbox` header, so third-party code runs with an opaque origin and can't reach this app.

The theme isn't in a preview's URL. The preview asks the page for it by `postMessage` and is told when it changes (`src/lib/preview-bridge.ts`), so switching theme never reloads a preview, and the first rows of the grid can be in the server's HTML and start loading before the page hydrates. The rest load as they near the screen, eight at a time. Opened on its own, a preview follows `?theme=dark` or the system setting.

## The aggregated registry

The whole collection is also a shadcn-compatible registry:

- `GET /r/registry.json`: every component, tagged with its category and source library
- `GET /r/<library>--<component>.json`: one component with full source, e.g. `/r/magicui--marquee.json`

```bash
npx shadcn@latest add http://localhost:3000/r/magicui--marquee.json
```

JSON endpoints for other tools: `GET /api/search?q=animated+carousel&category=&library=easyui,magicui&animated=1` (`library` takes one slug or several, comma-separated), `GET /api/components/<library>/<component>`, `GET|POST /api/libraries`.

## For agents

An agent can ask the aggregator for components that fit a need, or for other libraries' versions of a component, and get back install commands, source and preview links (`src/lib/agent.ts`). [`/llms.txt`](http://localhost:3000/llms.txt) explains all of it to an agent, with the live list of categories and libraries.

- **Agent skill:** `skills/allcomps/SKILL.md` has a coding agent (Claude Code, Cursor and others) check the catalogue at https://allcomps.vercel.app before writing a UI component: it searches `/api/alternatives` for each piece a request needs, uses a clear fit, asks the user to choose when several fit (with preview links), and installs with the shadcn CLI. The site serves it at `/skill` (`src/app/skill/route.ts`), so it installs with `npx skills add https://allcomps.vercel.app/skill`, the command behind the "add the skill" chip in every page's toolbar (`src/components/skill-install.tsx`). Set `ALLCOMPS_URL` to point it at another copy of the site.

- **MCP:** `POST /mcp` is a Model Context Protocol server (Streamable HTTP, stateless, read-only) with the tools `find_components`, `component_alternatives`, `get_component` and `list_categories`. Add it to Claude Code with:

  ```bash
  claude mcp add --transport http components http://localhost:3000/mcp
  ```

- **HTTP:** `GET /api/alternatives?query=animated+pricing+table` finds candidates; `GET /api/alternatives?for=magicui/marquee` finds alternatives to a component. Both take `category`, `library` and `limit` (1-24, default 8).

## Product analytics

[Polishd](https://polishd.site) (`@polishd/next`) records how visitors use the site (rage and dead clicks, scroll depth, web vitals) and reviews its design, with a dashboard at `/polishd`. Its pieces: `src/instrumentation-client.ts` starts capture, `src/app/api/polishd/route.ts` stores events and gives each visitor an anonymous session cookie with its response to their first batch, and `src/app/polishd/page.tsx` is the dashboard. The dashboard opens already knowing what `polishd.defaults.json` says about the site and its repository; anything saved in the dashboard overrides it, and since it's committed, a key never goes in it. There's no proxy: since Polishd 0.3.2 the route sets the cookie itself, so page requests and previews never pass through one. With `cacheComponents` on, neither the route nor the page declares `runtime` or `dynamic`, and the dashboard renders inside `<Suspense>`.

Locally, events go to `.polishd/analytics.db` (ignored by git and the Vercel CLI) with nothing to set up. In production (see `.env.example`):

- `POLISHD_DASHBOARD_TOKEN` (make one with `openssl rand -hex 32`) unlocks the dashboard. Without it, production shows a locked screen.
- `POLISHD_DATABASE_URL`, a pooled Postgres connection string, is where production events go, in Polishd's own tables (`polishd_events` and `polishd_meta`). Vercel's disk is read-only, so until it's set, capture does nothing in production and `/polishd` shows how to connect one; the site is otherwise unaffected.
- A Vercel Blob store connected to the project (`BLOB_STORE_ID`) holds the dashboard's site snapshots. Polishd's hosted screenshot service takes them from the dashboard, so page URLs and pixels pass through it, and only once the owner has agreed in the dashboard.
