// Shapes shared by the ingestion adapters, the database layer and the UI.

/** A source file belonging to a component. `content` may be missing until it is fetched lazily from `url`. */
export type ComponentFile = {
  path: string;
  content?: string;
  url?: string;
  type?: string;
  target?: string;
};

/** Registry styling that a component needs at runtime (keyframes, theme tokens). */
export type ComponentStyles = {
  cssVars?: Record<string, Record<string, string>>;
  css?: Record<string, unknown>;
  tailwind?: { config?: { theme?: { extend?: Record<string, unknown> } } };
};

/** A usage demo. `searched` records which version of the demo search ran when none was found. */
export type ExampleRef = { name?: string; itemUrl?: string; files?: ComponentFile[]; searched?: number };

/** What an adapter extracts from a library, before categorisation. */
export type RawComponent = {
  /** Unique within its library, URL-safe. */
  slug: string;
  name: string;
  description?: string;
  /** Path segments, registry categories, section headings: anything that hints at the category. */
  hints?: string[];
  tags?: string[];
  framework?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  installCommand?: string;
  docsUrl?: string;
  sourceUrl?: string;
  previewImage?: string;
  /** Registry item JSON that holds the full source, fetched on demand. */
  itemUrl?: string;
  files?: ComponentFile[];
  /** A usage demo, when the library ships one. */
  example?: ExampleRef;
  styles?: ComponentStyles;
  variants?: string[];
  kind?: string;
};

/** Where a library's source files live, so previews can resolve imports. */
export type RepoRef = { owner: string; repo: string; branch: string };

export type ExtractResult = {
  strategy: "shadcn-registry" | "repo-scan" | "docs-crawl";
  name?: string;
  description?: string;
  homepage?: string;
  repo?: RepoRef;
  components: RawComponent[];
  warnings: string[];
  /** The library's own stylesheets (theme tokens, type ramp, globals) that its components' classes rely on. */
  themeCss?: string;
};

export type Progress = (message: string) => void;

export type LibraryStatus = "pending" | "ingesting" | "ready" | "error" | "blocked";

export type Library = {
  id: number;
  slug: string;
  name: string;
  url: string;
  homepage: string | null;
  description: string | null;
  strategy: string | null;
  status: LibraryStatus;
  progress: string | null;
  error: string | null;
  warnings: string[];
  componentCount: number;
  frameworks: string[];
  repo: RepoRef | null;
  createdAt: string;
  ingestedAt: string | null;
};

/** A categorised component as stored in the collection. */
export type Component = {
  id: string;
  libraryId: number;
  librarySlug: string;
  libraryName: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  categories: string[];
  tags: string[];
  confidence: number;
  categorySource: "heuristic" | "manual";
  framework: string | null;
  styling: string | null;
  animated: boolean;
  dependencies: string[];
  registryDependencies: string[];
  installCommand: string | null;
  docsUrl: string | null;
  sourceUrl: string | null;
  previewImage: string | null;
  itemUrl: string | null;
  files: ComponentFile[];
  example: ExampleRef | null;
  styles: ComponentStyles | null;
  variants: string[];
  kind: string | null;
  updatedAt: string;
};

/** The slice of a component the grid and search results need. */
export type ComponentSummary = Pick<
  Component,
  "id" | "libraryId" | "librarySlug" | "libraryName" | "slug" | "name" | "description" | "category" | "categories" | "framework" | "animated" | "docsUrl" | "previewImage" | "dependencies" | "kind"
>;
