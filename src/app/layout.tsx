import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CO SNAP Cliffs",
  description: "Adjust Colorado SNAP parameters and see how cliffs shift.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
