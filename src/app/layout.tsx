import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CO SNAP Cliffs — Axiom Foundation",
  description: "Adjust Colorado SNAP parameters and see how cliffs shift.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/axiom-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/axiom-icon-512.png",
  },
};

// Warm Modal in the background as soon as a user requests the HTML.
// By the time client JS loads and fires /api/cliff-sweep, the engine
// container should be up — much smoother first sweep on a cold pod.
if (process.env.AXIOM_ENGINE_URL) {
  fetch(`${process.env.AXIOM_ENGINE_URL.replace(/\/$/, "")}/health`).catch(() => {});
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
