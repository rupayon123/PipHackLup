import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PipHackLup",
  description: "Hackathon Discord operations dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
