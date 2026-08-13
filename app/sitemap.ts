import type { MetadataRoute } from "next";

const publicSiteUrl = "https://focus-party-pomodoro-g97.focus-party-g97.workers.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${publicSiteUrl}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
