import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://piphacklup.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PipHackLup - Hackathon Discord Bot",
    template: "%s | PipHackLup",
  },
  description:
    "PipHackLup is a hackathon Discord bot for staff-trained Q&A, onboarding, mentor queues, team formation, moderation cases, AutoMod setup, and organizer dashboards.",
  keywords: [
    "PipHackLup",
    "hackathon Discord bot",
    "Discord hackathon bot",
    "hackathon mentor queue",
    "hackathon team formation",
    "Discord moderation bot",
    "Discord onboarding bot",
    "hackathon organizer dashboard",
    "hackathon AI assistant",
    "hackathon FAQ bot",
  ],
  authors: [{ name: "Rupayon Haldar", url: "https://github.com/rupayon123" }],
  creator: "Rupayon Haldar",
  publisher: "Rupayon Haldar",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "PipHackLup",
    title: "PipHackLup - Hackathon Discord Bot",
    description:
      "Run hackathon Discord servers with staff-trained Q&A, guided onboarding, queues, team matching, moderation cases, and a public organizer dashboard.",
    images: [
      {
        url: "/piphacklup-site-hero.png",
        width: 2400,
        height: 1350,
        alt: "PipHackLup high-resolution 8-bit hackathon Discord bot hero",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PipHackLup - Hackathon Discord Bot",
    description:
      "A public hackathon Discord bot for staff-trained Q&A, onboarding, queues, team formation, moderation, and dashboards.",
    images: ["/piphacklup-site-hero.png"],
  },
  icons: {
    icon: "/piphacklup-avatar.png",
    apple: "/piphacklup-avatar.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
