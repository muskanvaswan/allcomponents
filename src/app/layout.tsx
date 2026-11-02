import type { Metadata, Viewport } from "next";
import { Fira_Code, JetBrains_Mono, Manrope, Newsreader, Unbounded } from "next/font/google";
import { SoundEffects } from "@/components/sound";
import { PREVIEW_BRIDGE_SCRIPT } from "@/lib/preview-bridge";
import { SCROLLBAR_SCRIPT } from "@/lib/scrollbars";
import { SIDEBAR_SCRIPT } from "@/lib/sidebar";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Manrope for text and Unbounded, light, for headings (chosen 2026-11-02 from a picker of options).
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const unbounded = Unbounded({ variable: "--font-unbounded", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
// The toolbar's "add the skill" chip's face.
const fira = Fira_Code({ variable: "--font-fira", subsets: ["latin"] });
// The italic serif "All" in the home page's heading.
const serif = Newsreader({ variable: "--font-newsreader", style: "italic", subsets: ["latin"] });

// Each page sets its own title and canonical address; these are the defaults beneath them.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

// The browser's own chrome matches the page: paper in light mode, black in dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Each page renders its own <Toolbar>, so the home page's sidebar can reach the top of the window.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // THEME_SCRIPT and SIDEBAR_SCRIPT set data-theme and data-sidebar on <html> before hydration.
    <html lang="en" className={`${manrope.variable} ${unbounded.variable} ${mono.variable} ${fira.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SCROLLBAR_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PREVIEW_BRIDGE_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <SoundEffects />
      </body>
    </html>
  );
}
