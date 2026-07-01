import type { Metadata } from "next";
import "./globals.css";

// Deliberately not using next/font/google here: it fetches font files from
// Google's CDN at build time, which may not be reachable in locked-down CI
// or sandboxed build environments. System font stacks (set in globals.css)
// keep the build fully offline-capable.

export const metadata: Metadata = {
  title: "Compliant Privacy Pool",
  description: "Shielded stablecoin transfers on Stellar with ASP allow-list compliance, proven in zero-knowledge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
