// The category taxonomy every ingested component is sorted into, plus the
// keyword classifier that does the sorting.

export type Category = {
  id: string;
  label: string;
  group: string;
  /** Lower-case words or phrases. Phrases (with spaces) score higher than single words. */
  terms: string[];
  /** Down-weights broad buckets so specific categories win ties. */
  weight?: number;
  /**
   * When the name says this, the rest of the name only describes a variant of it: a
   * "Chart Bar Label" or "Chart Tooltip" is a chart, not a form or a tooltip. The
   * component goes here alone, with no secondary categories.
   */
  absorbs?: boolean;
};

export const GROUPS = [
  "Actions",
  "Forms",
  "Navigation",
  "Overlays",
  "Feedback",
  "Data display",
  "Layout",
  "Media",
  "Sections",
  "Text",
  "Effects",
  "Other",
] as const;

export const CATEGORIES: Category[] = [
  // Actions
  { id: "button", label: "Buttons", group: "Actions", terms: ["button", "btn", "buttons", "icon button", "button group", "fab", "cta button", "copy button", "like button", "submit button"] },
  { id: "switch", label: "Toggles & switches", group: "Actions", terms: ["switch", "toggle", "toggle group", "theme toggle", "theme switcher", "dark mode toggle", "mode toggle"] },
  { id: "dropdown", label: "Menus & toolbars", group: "Actions", terms: ["dropdown", "dropdown menu", "context menu", "menubar", "menu", "submenu", "action menu", "radial menu", "toolbar", "floating toolbar", "action bar", "bulk action"] },

  // Forms
  { id: "input", label: "Inputs", group: "Forms", terms: ["input", "text field", "textfield", "textarea", "text area", "search bar", "search input", "expandable search", "password input", "input otp", "otp", "pin input", "tag input", "placeholders", "vanish input", "number input", "phone input", "prompt input"] },
  { id: "select", label: "Selects & comboboxes", group: "Forms", terms: ["select", "combobox", "autocomplete", "multi select", "multiselect", "listbox", "picker"] },
  { id: "checkbox", label: "Checkboxes & radios", group: "Forms", terms: ["checkbox", "check box", "radio", "radio group", "checklist"] },
  { id: "slider", label: "Range sliders", group: "Forms", terms: ["slider", "range", "range slider", "elastic slider", "dial", "knob", "rotary"] },
  { id: "date-picker", label: "Calendars & date pickers", group: "Forms", terms: ["calendar", "date picker", "datepicker", "date range", "time picker", "scheduler", "date"] },
  { id: "form", label: "Forms", group: "Forms", terms: ["form", "field", "fieldset", "label", "newsletter", "contact form", "validation", "survey", "drag to confirm"] },
  { id: "file-upload", label: "File upload", group: "Forms", terms: ["file upload", "upload", "dropzone", "file input", "file picker"] },
  { id: "auth", label: "Auth screens", group: "Forms", terms: ["login", "log in", "sign in", "signin", "signup", "sign up", "register", "auth", "authentication", "forgot password", "reset password"] },
  { id: "rating", label: "Ratings", group: "Forms", terms: ["rating", "star rating", "stars rating", "feedback rating"] },
  { id: "color-picker", label: "Color pickers", group: "Forms", terms: ["color picker", "colour picker", "color", "palette picker"] },

  // Navigation
  { id: "navbar", label: "Navbars & headers", group: "Navigation", terms: ["navbar", "nav bar", "navigation bar", "header", "top bar", "topbar", "app bar", "navigation menu", "nav menu", "mega menu", "floating navbar", "navigation", "nav"] },
  { id: "sidebar", label: "Sidebars", group: "Navigation", terms: ["sidebar", "side bar", "sidenav", "side nav", "side menu", "app sidebar"] },
  { id: "tabs", label: "Tabs & segmented controls", group: "Navigation", terms: ["tabs", "tab", "segmented control", "segmented", "tab bar"] },
  { id: "breadcrumb", label: "Breadcrumbs", group: "Navigation", terms: ["breadcrumb", "breadcrumbs"] },
  { id: "pagination", label: "Pagination", group: "Navigation", terms: ["pagination", "pager", "paginate"] },
  { id: "stepper", label: "Steppers", group: "Navigation", terms: ["stepper", "steps", "wizard", "progress steps", "onboarding"] },
  { id: "dock", label: "Docks", group: "Navigation", terms: ["dock", "floating dock", "mac dock", "dynamic island"] },
  { id: "command", label: "Command palettes", group: "Navigation", terms: ["command", "command palette", "command menu", "cmdk", "kbar", "spotlight search", "quick search"] },
  { id: "footer", label: "Footers", group: "Navigation", terms: ["footer"] },

  // Overlays
  { id: "dialog", label: "Dialogs & modals", group: "Overlays", terms: ["dialog", "modal", "alert dialog", "lightbox", "popup", "confirm dialog"] },
  { id: "drawer", label: "Drawers & sheets", group: "Overlays", terms: ["drawer", "sheet", "bottom sheet", "side panel", "vaul", "tray"] },
  { id: "popover", label: "Popovers & hover cards", group: "Overlays", terms: ["popover", "hover card", "hovercard", "link preview"] },
  { id: "tooltip", label: "Tooltips", group: "Overlays", terms: ["tooltip", "tool tip", "tooltips", "animated tooltip"] },

  // Feedback
  { id: "toast", label: "Toasts & alerts", group: "Feedback", terms: ["toast", "toaster", "sonner", "snackbar", "notification", "notifications", "alert", "banner", "callout", "announcement"] },
  { id: "progress", label: "Progress & meters", group: "Feedback", terms: ["progress", "progress bar", "circular progress", "progress circle", "meter", "gauge"] },
  { id: "loader", label: "Loaders & skeletons", group: "Feedback", terms: ["loader", "loading", "spinner", "skeleton", "preloader", "shimmer loading"] },
  { id: "badge", label: "Badges & chips", group: "Feedback", terms: ["badge", "chip", "pill", "tag", "status", "status indicator"] },

  // Data display
  { id: "card", label: "Cards", group: "Data display", terms: ["card", "cards", "tile", "glare card", "wobble card", "profile card", "info card", "flip card"] },
  { id: "table", label: "Tables & data grids", group: "Data display", terms: ["table", "data table", "datatable", "data grid", "datagrid", "spreadsheet", "data row"] },
  { id: "list", label: "Lists & feeds", group: "Data display", terms: ["list", "animated list", "feed", "activity feed", "log", "inbox", "kanban"] },
  { id: "avatar", label: "Avatars", group: "Data display", terms: ["avatar", "avatars", "avatar group", "avatar stack", "avatar circles", "profile picture"] },
  { id: "accordion", label: "Accordions", group: "Data display", terms: ["accordion", "collapsible", "disclosure", "expandable"] },
  { id: "chart", label: "Charts", group: "Data display", absorbs: true, terms: ["chart", "charts", "graph", "bar chart", "line chart", "pie chart", "area chart", "donut chart", "donut", "radar chart", "sparkline", "heatmap", "data visualization", "plot", "funnel"] },
  { id: "timeline", label: "Timelines", group: "Data display", terms: ["timeline", "roadmap", "changelog", "history", "activity timeline"] },
  { id: "tree", label: "Tree views", group: "Data display", terms: ["tree", "tree view", "file tree", "treeview", "folder tree", "file explorer"] },
  { id: "code", label: "Code & terminal", group: "Data display", terms: ["code", "code block", "codeblock", "snippet", "code snippet", "syntax", "terminal", "script copy", "diff", "console"] },
  { id: "kbd", label: "Keyboard keys", group: "Data display", terms: ["kbd", "keyboard", "shortcut", "hotkey", "keycap"] },
  { id: "stats", label: "Stats & KPIs", group: "Data display", terms: ["stat", "stats", "statistic", "statistics", "kpi", "metric", "metrics"] },
  { id: "map", label: "Maps & globes", group: "Data display", terms: ["map", "globe", "world map", "earth", "maps", "dotted map"] },
  { id: "clock", label: "Clocks & countdowns", group: "Data display", terms: ["clock", "countdown", "timer", "stopwatch", "world clock"] },

  // Layout
  { id: "layout", label: "Layout & grids", group: "Layout", weight: 0.75, terms: ["bento", "bento grid", "layout grid", "grid layout", "masonry", "layout", "container", "resizable", "split pane", "aspect ratio", "columns", "stack"] },
  { id: "separator", label: "Separators", group: "Layout", terms: ["separator", "divider"] },
  { id: "scroll-area", label: "Scroll areas", group: "Layout", terms: ["scroll area", "scrollarea", "scrollbar"] },

  // Media
  { id: "carousel", label: "Carousels & marquees", group: "Media", terms: ["carousel", "slideshow", "image slider", "images slider", "marquee", "swiper", "infinite moving", "moving cards", "scroll velocity", "velocity scroll", "card stack", "stack cards", "embla", "coverflow", "rolling gallery"] },
  { id: "gallery", label: "Images & galleries", group: "Media", terms: ["gallery", "image gallery", "photo gallery", "image", "images", "photo", "lens", "zoom", "image comparison", "before after", "compare", "focus cards", "parallax gallery"] },
  { id: "video", label: "Video & audio", group: "Media", terms: ["video", "video player", "hero video", "video dialog", "audio", "music player", "media player", "player", "waveform", "voice"] },
  { id: "icon", label: "Icons", group: "Media", terms: ["icon", "icons", "animated icon", "icon cloud", "logo"] },
  { id: "mockup", label: "Device mockups", group: "Media", terms: ["mockup", "iphone", "android", "safari", "browser mockup", "device", "macbook", "phone", "laptop", "browser window"] },

  // Sections
  { id: "hero", label: "Hero sections", group: "Sections", terms: ["hero", "hero section", "hero parallax", "jumbotron", "landing", "above the fold", "splash"] },
  { id: "features", label: "Feature sections", group: "Sections", terms: ["feature", "features", "feature section", "feature grid", "benefits", "services", "how it works"] },
  { id: "pricing", label: "Pricing", group: "Sections", terms: ["pricing", "price", "plans", "pricing table", "subscription", "billing", "checkout"] },
  { id: "testimonials", label: "Testimonials", group: "Sections", terms: ["testimonial", "testimonials", "reviews", "review", "quote", "quotes", "tweet", "tweet card", "social proof"] },
  { id: "cta", label: "Calls to action", group: "Sections", terms: ["cta", "call to action", "book call", "book a call", "waitlist"] },
  { id: "faq", label: "FAQ sections", group: "Sections", terms: ["faq", "faqs", "frequently asked", "questions"] },
  { id: "logo-cloud", label: "Logo clouds", group: "Sections", terms: ["logo cloud", "logos", "brands", "partners", "clients", "trusted by", "logo marquee", "companies"] },
  { id: "team", label: "Team sections", group: "Sections", terms: ["team", "members", "people", "staff"] },
  { id: "contact", label: "Contact sections", group: "Sections", terms: ["contact", "contact us", "get in touch"] },
  { id: "blog", label: "Blog & content", group: "Sections", terms: ["blog", "article", "post", "posts", "news", "content"] },
  { id: "dashboard", label: "Dashboards", group: "Sections", terms: ["dashboard", "admin", "analytics", "app shell", "overview"] },
  { id: "ecommerce", label: "E-commerce", group: "Sections", terms: ["product", "cart", "shop", "store", "ecommerce", "e-commerce", "order", "payment", "receipt", "invoice"] },
  { id: "ai-chat", label: "AI & chat", group: "Sections", terms: ["ai", "chat", "chatbot", "message", "messages", "conversation", "assistant", "agent", "llm", "ai response", "ai agent"] },

  // Text
  { id: "text-effect", label: "Text animations", group: "Text", weight: 0.9, terms: ["text", "typing", "typewriter", "type writer", "text animation", "text effect", "word rotate", "words", "letters", "letter", "scramble", "decrypt", "shuffle", "gradient text", "shiny text", "glitch", "blur text", "split text", "morphing text", "flip words", "text reveal", "text generate", "hyper text", "highlighter", "headline", "heading", "typography", "animated text", "sparkles text", "aurora text", "rotating text", "circular text", "fuzzy text", "font", "variable font"] },
  { id: "number", label: "Number & counters", group: "Text", terms: ["number ticker", "number", "counter", "count up", "countup", "odometer", "animated number", "sliding number", "ticker", "digits"] },

  // Effects
  { id: "background", label: "Backgrounds", group: "Effects", terms: ["background", "backgrounds", "bg", "backdrop", "aurora", "beams", "background beams", "meteors", "stars", "starfield", "shooting stars", "particles", "sparkles", "grid pattern", "dot pattern", "dots", "dot field", "retro grid", "flickering grid", "animated grid", "ripple", "wavy", "waves", "vortex", "noise", "gradient", "spotlight", "lamp", "boxes", "shader", "warp", "light rays", "silk", "orb", "lightning", "galaxy", "dither", "plasma", "pattern", "liquid", "smoke", "fluid", "threads", "iridescence", "hyperspeed", "squares", "grain", "mesh gradient", "corridor"] },
  { id: "cursor", label: "Cursor effects", group: "Effects", terms: ["cursor", "pointer", "following pointer", "cursor follower", "mouse", "trail", "cursor trail", "blob cursor", "splash cursor", "click spark", "crosshair"] },
  { id: "scroll", label: "Scroll animations", group: "Effects", terms: ["scroll", "scroll progress", "parallax", "scroll reveal", "sticky scroll", "reveal", "blur fade", "fade in", "animated content", "container scroll", "tracing beam", "in view", "smooth scroll", "page transition", "transition", "sticky", "stacking", "progressive blur", "blur"] },
  { id: "3d", label: "3D effects", group: "Effects", terms: ["3d", "three", "threejs", "webgl", "tilt", "tilted", "perspective", "3d card", "3d pin", "depth", "cube", "sphere"] },
  { id: "border", label: "Borders & glows", group: "Effects", terms: ["border", "border beam", "shine border", "moving border", "glow", "glowing", "neon", "glare", "outline", "magic card", "spotlight card"] },
  { id: "interaction", label: "Interactions & gestures", group: "Effects", terms: ["drag", "draggable", "sortable", "drag and drop", "swipe", "gesture", "magnetic", "magnet", "confetti", "party popper", "hover", "hover effect", "physics", "inertia", "elastic", "spring", "haptic", "lens", "swing"] },
  { id: "animation", label: "Motion primitives", group: "Effects", weight: 0.55, terms: ["animation", "animated", "animate", "motion", "morph", "orbit", "orbiting", "orbiting circles", "circular orbit", "pulse", "ripple", "bounce", "float", "stagger", "beam", "animated beam", "effect", "evil eye"] },

  { id: "other", label: "Other", group: "Other", terms: [] },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

const STOPWORDS = new Set(["a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on", "by", "that", "this", "your", "you", "is", "are", "can", "be", "it", "its", "as", "from", "ui", "component", "components", "demo", "example", "react", "vue", "svelte", "tailwind", "css", "simple", "beautiful", "modern", "custom", "new", "v2", "v3", "default", "basic", "using", "built", "made", "use"]);

/** Splits camelCase, kebab-case and snake_case, lowercases, drops trailing digits. */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !/^\d+$/.test(t));
}

function singular(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

type Field = { tokens: Set<string>; text: string };

function field(text: string): Field {
  const tokens = tokenize(text);
  const all = new Set<string>();
  for (const t of tokens) {
    all.add(t);
    all.add(singular(t));
  }
  return { tokens: all, text: ` ${tokens.join(" ")} ` };
}

function matches(f: Field, term: string): boolean {
  if (term.includes(" ")) return f.text.includes(` ${term} `);
  return f.tokens.has(term) || f.tokens.has(singular(term));
}

export type Classification = {
  category: string;
  categories: string[];
  confidence: number;
  tags: string[];
};

export type ClassifyInput = {
  name: string;
  description?: string;
  hints?: string[];
  tags?: string[];
  kind?: string;
};

/**
 * Scores every category against the component's name, path/registry hints and
 * description. The name dominates; description words only break ties or fill in
 * when the name is opaque (e.g. "Silk", "Balatro").
 */
export function classify(input: ClassifyInput): Classification {
  const nameF = field(input.name);
  const hintF = field([...(input.hints ?? []), ...(input.tags ?? [])].join(" "));
  const descF = field(input.description ?? "");

  const family = CATEGORIES.find((cat) => cat.absorbs && cat.terms.some((term) => matches(nameF, term)));
  if (family) return { category: family.id, categories: [], confidence: 1, tags: deriveTags(input) };

  const scores: { id: string; score: number }[] = [];
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const term of cat.terms) {
      const phrase = term.includes(" ");
      if (matches(nameF, term)) score += phrase ? 7 : 5;
      else if (matches(hintF, term)) score += phrase ? 4 : 3;
      if (matches(descF, term)) score += phrase ? 1.6 : 0.8;
    }
    score *= cat.weight ?? 1;
    if (score > 0) scores.push({ id: cat.id, score });
  }
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  if (!top || top.score < 0.8) {
    return { category: "other", categories: [], confidence: 0, tags: deriveTags(input) };
  }
  const second = scores[1]?.score ?? 0;
  const confidence = Math.min(1, (top.score - second) / top.score + top.score / 20);
  const categories = scores
    .slice(1)
    .filter((s) => s.score >= Math.max(3, top.score * 0.5))
    .slice(0, 3)
    .map((s) => s.id);
  return { category: top.id, categories, confidence: round(confidence), tags: deriveTags(input) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function deriveTags(input: ClassifyInput): string[] {
  const tags = new Set<string>();
  for (const t of input.tags ?? []) tags.add(t.toLowerCase());
  for (const t of tokenize(input.name)) if (!STOPWORDS.has(t) && t.length > 1) tags.add(t);
  return [...tags].slice(0, 12);
}

/** Categories a free-text query is asking for, e.g. "animated carousel" → ["carousel"]. */
export function categoriesForQuery(query: string): string[] {
  const f = field(query);
  const hits: { id: string; score: number }[] = [];
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const term of cat.terms) if (matches(f, term)) score += term.includes(" ") ? 2 : 1;
    if (score > 0 && cat.id !== "animation") hits.push({ id: cat.id, score: score * (cat.weight ?? 1) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 3).map((h) => h.id);
}

export function queryTokens(query: string): string[] {
  return tokenize(query).filter((t) => !STOPWORDS.has(t));
}
