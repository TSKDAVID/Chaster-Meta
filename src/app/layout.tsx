import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

/** Brand wordmark — Clash Display */
const brand = localFont({
  src: [
    {
      path: "../fonts/ClashDisplay-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/ClashDisplay-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-brand",
  display: "swap",
});

/** Section titles / chrome headlines — Outfit */
const headline = Outfit({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/** Chat, timestamps, dense UI — Inter */
const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Chaster · Inbox",
  description: "Operator portal for Meta Messenger & Instagram",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
      { url: "/icon.png?v=3", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png?v=3", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

const themeBootScript = `
(function(){
  try {
    var raw = localStorage.getItem('chaster_operator_prefs_v1');
    var theme = 'slate';
    var custom = null;
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.v === 2 && parsed.byAccount) {
        var id = parsed.lastAccountId || 'local';
        var account = parsed.byAccount[id] || parsed.byAccount.local;
        if (account && typeof account.theme === 'string') theme = account.theme;
        if (account && account.customColors) custom = account.customColors;
      } else if (parsed && typeof parsed.theme === 'string') {
        theme = parsed.theme;
        if (parsed.customColors) custom = parsed.customColors;
      }
    }
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'custom' && custom && custom.base && custom.panel && custom.accent) {
      var root = document.documentElement;
      root.style.setProperty('--background', custom.base);
      root.style.setProperty('--chaster-panel', custom.panel);
      root.style.setProperty('--chaster-chat-bg', custom.panel);
      root.style.setProperty('--chaster-header', custom.panel);
      root.style.setProperty('--chaster-accent', custom.accent);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${brand.variable} ${headline.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
