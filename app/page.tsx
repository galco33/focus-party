import LandingPage from "./LandingPage";

const publicSiteUrl = "https://focus-party-pomodoro-g97.focus-party-g97.workers.dev";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${publicSiteUrl}/#website`,
      name: "Focus Party",
      alternateName: "Focus Party Pomodoro",
      url: `${publicSiteUrl}/`,
      inLanguage: ["fr", "en", "es"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${publicSiteUrl}/#application`,
      name: "Focus Party",
      url: `${publicSiteUrl}/`,
      description: "Pomodoro communautaire gratuit pour Twitch avec dashboard streamer, overlays OBS et commandes depuis le chat.",
      applicationCategory: "ProductivityApplication",
      applicationSubCategory: "Streaming tool",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      license: "https://opensource.org/license/mit",
      offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
      featureList: ["Timer Pomodoro Twitch", "Overlays OBS transparents", "Task List communautaire", "Commandes depuis le chat Twitch", "Thèmes accessibles", "Interface française, anglaise et espagnole"],
    },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <LandingPage />
    </>
  );
}
