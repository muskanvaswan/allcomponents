---
name: allcomps
description: Finds ready-made React + Tailwind components in the Components catalogue (allcomps.vercel.app), which gathers hundreds of components from shadcn/ui, Magic UI, EasyUI, Board UI, Rare UI, Pin UI and more, each with a live preview and a shadcn install command. Use whenever building or changing UI, whether a page, a section, a form, a dashboard or a single component such as a date picker, pricing table, sidebar, carousel, chart, toast or animated text, before writing that component from scratch. When several components fit, shows the user the alternatives with preview links and lets them choose; then installs the chosen one with the shadcn CLI.
---

# Components catalogue

Before you write a UI component yourself, check whether the catalogue at https://allcomps.vercel.app already has one that fits. It collects components from many libraries, each with its source, a live preview and an install command. Use what fits, show the user the choices when there's more than one good one, and build from scratch only when nothing fits.

The base URL is `https://allcomps.vercel.app`, unless the `ALLCOMPS_URL` environment variable says otherwise.

## The API

Everything is plain HTTP; use `curl -s`.

- **Find components for a need:** `GET /api/alternatives?query=<need>&limit=6`

  Returns `{ query, category, total, results: [...] }`. Each result has `id`, `name`, `library`, `category`, `description`, `animated`, `framework`, `dependencies`, `install` (a ready `npx shadcn@latest add …` command), `registryItem` (the item's JSON, with full source), `preview` (a live demo), `page` (the catalogue page, with code) and `docs` (the original library's page).

  It also takes `category=<id>` and `library=<slug>[,<slug>]`.

- **Alternatives to a component you've picked:** `GET /api/alternatives?for=<id>&limit=6`
- **Categories and libraries:** `GET /llms.txt`, which lists every category id and library slug.
- **Full source:** `GET <registryItem>`, a shadcn registry item whose `files[].content` holds the code.

Search matches words and categories, not meaning. Query with the component's everyday name ("date range picker", "pricing table", "animated number", "command palette"), not a sentence. If nothing comes back, try a synonym or filter by `category`.

## Workflow

1. **Break the request into components.** A "SaaS landing page" might need a navbar, a hero, a logo marquee, a pricing table, a FAQ and a footer. Skip anything the project already has: look in its `components/` folders first and keep its own design system.
2. **Search for each one** (`limit=6` is plenty), running independent searches in parallel.
3. **Judge the results** against the request: what the component does, how it looks (`description`, and the `preview` if it's unclear), whether it suits the project (React only; `framework` says), and whether its `dependencies` are acceptable, for example a project on `motion` may not want `framer-motion` as well.
4. **Decide.**
   - **One clear fit:** use it, and tell the user in one line which component it is and which library it's from.
   - **Several genuine fits:** ask before installing. Use the AskUserQuestion tool with up to four distinct options. Each label is "Name (Library)". Each description says in one line how it differs and ends with its preview link. If the session has a browser you can drive, open the previews for them. Leave out near-duplicates.
   - **Nothing fits:** build it as you normally would.
5. **Install.**
   - **If the project has a `components.json`:** run the result's `install` command. The shadcn CLI writes the files and installs the npm dependencies.
   - **If it doesn't:** ask whether to set up shadcn (`npx shadcn@latest init`). If the user doesn't want that, fetch `registryItem` instead, write each `files[].content` to its `target` (or `path`), install the listed `dependencies` with the project's package manager, and fix the `@/` import aliases to match the project.
6. **Adapt it.** Wire in the real props, data and copy. Keep the component's own code unless the use case needs a change, and say what you changed.
7. **Credit the library** where its docs ask for attribution (open the `docs` link if unsure). Rare UI, for one, asks for a visible link.

## Notes

- **Previews:** the `preview` URL is the live, sandboxed component. The `page` URL shows its code, install commands and alternatives from other libraries.
- **Read-only:** you can't add libraries or change categories through the API.
- **Search scope:** when the user names a library they like, filter to it with `library=<slug>`.
