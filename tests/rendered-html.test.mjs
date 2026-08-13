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

test("server-renders the Focus Party dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Focus Party/);
  assert.match(html, /FOCUS/);
  assert.match(html, /Dashboard/);
  assert.match(html, /Se connecter à Twitch/);
  assert.match(html, /Commandes Twitch/);
  assert.match(html, /TASK LIST/);
  assert.match(html, /!task remove 1/);
  assert.doesNotMatch(html, /simulateur|noctua_dev/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("server-renders the dedicated OBS overlay", async () => {
  const response = await render("/overlay");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FOCUS PARTY/);
  assert.match(html, /SESSION/);
  assert.match(html, /READY/);
});

test("keeps persistence and starter cleanup explicit", async () => {
  const [hosting, migration, packageJson] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_init_focus_party.sql", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(migration, /CREATE TABLE `pomodoro_sessions`/);
  assert.match(migration, /idx_tasks_channel_user/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
