import type { MetadataRoute } from "next";

const publicSiteUrl = "https://focus-party-pomodoro-g97.focus-party-g97.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${publicSiteUrl}/sitemap.xml`,
    host: publicSiteUrl,
  };
}
