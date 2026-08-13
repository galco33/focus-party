import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const publicSiteUrl = "https://focus-party-pomodoro-g97.focus-party-g97.workers.dev";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  await headers();
  const title = "Focus Party — Pomodoro Twitch gratuit avec overlay OBS";
  const description = "Timer Pomodoro Twitch gratuit et open source avec dashboard streamer, overlay OBS, Task List communautaire et commandes depuis le chat.";
  return {
    metadataBase: new URL(publicSiteUrl),
    title,
    description,
    applicationName: "Focus Party",
    category: "productivity",
    verification: {
      google: "pEL0-TOvrVmBboUJLt391cWOmSn1zpQlgUhMjTqO628",
    },
    keywords: ["pomodoro Twitch", "overlay Twitch", "overlay OBS", "timer Pomodoro OBS", "bot Twitch gratuit", "dashboard streamer gratuit", "Task List Twitch", "commandes chat Twitch", "productivité streaming", "Pomodoro open source"],
    alternates: { canonical: "/" },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: publicSiteUrl,
      siteName: "Focus Party",
      locale: "fr_FR",
      images: [{ url: `${publicSiteUrl}/og.png`, width: 1728, height: 910, alt: "Focus Party — Pomodoro Twitch gratuit avec overlay OBS" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${publicSiteUrl}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
