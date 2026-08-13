import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the public Focus Party landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Focus Party/);
  assert.match(html, /Pomodoro Twitch gratuit avec overlay OBS/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /name="google-site-verification"/);
  assert.match(html, /Le focus devient/);
  assert.match(html, /Se connecter à Twitch/);
  assert.match(html, /Le produit en images/i);
  assert.match(html, /Timer Pomodoro/);
  assert.match(html, /Task List communautaire/);
  assert.match(html, /api\/auth\/twitch\/start/);
  assert.match(html, /TASK LIST/);
  assert.doesNotMatch(html, /!task remove 1/);
  assert.doesNotMatch(html, /simulateur|noctua_dev/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("server-renders the dashboard on its dedicated route", async () => {
  const response = await render("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Dashboard/);
  assert.match(html, /Commandes Twitch/);
  assert.match(html, /TASK LIST/);
  assert.match(html, /!taskhelp/);
  assert.match(html, />0<\/strong>\/(?:<!-- -->)?0/);
  assert.doesNotMatch(html, /!task remove 1/);
  assert.match(html, /name="robots" content="noindex, nofollow, nocache"/);
});

test("server-renders the dedicated OBS overlay", async () => {
  const response = await render("/overlay");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FOCUS PARTY/);
  assert.match(html, /SESSION/);
  assert.match(html, /PRÊT/);
  assert.match(html, /LISTE DES TÂCHES/);
  assert.match(html, /!taskhelp/);
  assert.match(html, />0<\/strong>\/(?:<!-- -->)?0/);
});

test("keeps persistence, SEO, overlay modes and starter cleanup explicit", async () => {
  const [hosting, migration, brandingMigration, taskFocusMigration, packageJson, landingSource, dashboardSource, callbackSource, overlaySource, brandingRoute, i18nSource, layoutSource, robotsSource, sitemapSource, focusPartySource] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_init_focus_party.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_short_miracleman.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_large_molly_hayes.sql", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/twitch/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/overlay/Overlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/branding/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/i18n.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/focus-party.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(hosting, /"r2":\s*null/);
  assert.match(migration, /CREATE TABLE `pomodoro_sessions`/);
  assert.match(migration, /idx_tasks_channel_user/);
  assert.match(brandingMigration, /CREATE TABLE `overlay_branding`/);
  assert.match(brandingMigration, /`logo_data` blob/);
  assert.match(taskFocusMigration, /ALTER TABLE `tasks` ADD `focused` integer DEFAULT false NOT NULL/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(landingSource, /Se connecter/);
  assert.match(landingSource, /Connect with Twitch/);
  assert.match(landingSource, /Conectar con Twitch/);
  assert.match(landingSource, /focus-party-visual-theme/);
  assert.match(landingSource, /\/api\/auth\/twitch\/start/);
  assert.match(callbackSource, /"\/dashboard"/);
  assert.match(dashboardSource, /window\.location\.assign\("\/"\)/);
  assert.match(i18nSource, /Timer uniquement/);
  assert.match(i18nSource, /Task List uniquement/);
  assert.match(i18nSource, /Timer \+ Task List/);
  assert.match(i18nSource, /Focus.*Graphite.*Sable.*Océan.*Prune.*Glace.*Accessible/s);
  assert.match(dashboardSource, /theme=\$\{overlayTheme\}/);
  assert.match(i18nSource, /Classique.*Essentiel.*Compact.*Centré.*Ligne.*Contour/s);
  assert.match(dashboardSource, /timerStyle=\$\{timerLayout\}/);
  assert.match(dashboardSource, /lang=\$\{language\}/);
  assert.match(dashboardSource, /focus-party-language/);
  assert.match(dashboardSource, /focus-party-visual-theme/);
  assert.match(dashboardSource, /dataset\.visualTheme/);
  assert.match(dashboardSource, /colorblind/);
  assert.match(i18nSource, /Français.*English.*Español/s);
  assert.match(i18nSource, /Choose language.*Elegir idioma/s);
  assert.match(overlaySource, /display !== "tasks"/);
  assert.match(overlaySource, /display !== "timer"/);
  assert.match(overlaySource, /requestedLanguage/);
  assert.match(overlaySource, /useState<Language>\("fr"\)/);
  assert.match(overlaySource, /obs-theme-\$\{theme\}/);
  assert.match(overlaySource, /obs-layout-\$\{timerLayout\}/);
  assert.match(overlaySource, /obs-task-items/);
  assert.match(overlaySource, /task\.focused/);
  assert.doesNotMatch(overlaySource, /obs-task-row.*✓/);
  assert.match(focusPartySource, /"!taskhelp"/);
  assert.match(focusPartySource, /!task focus 1.*!task edit 1.*!task done 1.*!task remove 1/);
  assert.match(focusPartySource, /UPDATE tasks SET focused = 0/);
  assert.match(focusPartySource, /UPDATE tasks SET text = \?/);
  assert.match(overlaySource, /"accessible"/);
  assert.match(i18nSource, /Daltonisme.*Color-safe.*Daltonismo/s);
  assert.match(layoutSource, /Pomodoro Twitch gratuit avec overlay OBS/);
  assert.match(layoutSource, /dashboard streamer gratuit/);
  assert.match(robotsSource, /sitemap\.xml/);
  assert.match(robotsSource, /\/api\//);
  assert.match(sitemapSource, /priority: 1/);
  assert.match(i18nSource, /Pomodoro Twitch gratuit.*Overlay Twitch et OBS.*Task List communautaire/s);
  assert.match(i18nSource, /LOGO OU PETITE IMAGE/);
  assert.match(i18nSource, /Haut gauche.*Haut droite.*Bas gauche.*Bas droite/s);
  assert.match(overlaySource, /obs-custom-logo/);
  assert.match(brandingRoute, /image\/png/);
  assert.match(brandingRoute, /MAX_LOGO_BYTES/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
