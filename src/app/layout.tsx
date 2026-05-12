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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
