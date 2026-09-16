import type { Metadata } from "next";
import Link from "next/link";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MetroDraw",
  description: "Upload documents and get one metro map: each document is a line, stations are its points, junctions are where documents meet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="navbar bg-white border-bottom mb-4">
          <div className="container-fluid">
            <Link href="/" className="navbar-brand fw-bold text-decoration-none">MetroDraw</Link>
            <span className="text-secondary small">by Sourcebits</span>
          </div>
        </nav>
        <div className="container-fluid px-4 pb-5">{children}</div>
      </body>
    </html>
  );
}
