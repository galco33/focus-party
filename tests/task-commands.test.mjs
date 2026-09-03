import assert from "node:assert/strict";
import test from "node:test";

import { runCommand } from "../lib/focus-party.ts";

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  async first() {
    if (this.sql.includes("command_cooldowns")) {
      return { last_used_at: Date.now() };
    }
    throw new Error(`Unexpected first() query: ${this.sql}`);
  }

  async run() {
    this.database.executions.push({ sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDatabase {
  constructor() {
    this.executions = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

const channelId = "channel-focus-party";

test("a viewer cannot clear every task in the channel", async () => {
  const database = new FakeDatabase();

  await assert.rejects(
    runCommand(database, channelId, { id: "viewer-1", username: "viewer", role: "viewer" }, "!task clear all"),
    /réservée au streamer/,
  );

  assert.equal(database.executions.some(({ sql }) => /DELETE FROM tasks/i.test(sql)), false);
});

test("a moderator cannot clear every task in the channel", async () => {
  const database = new FakeDatabase();

  await assert.rejects(
    runCommand(database, channelId, { id: "moderator-1", username: "moderator", role: "moderator" }, "!task clear all"),
    /réservée au streamer/,
  );

  assert.equal(database.executions.some(({ sql }) => /DELETE FROM tasks/i.test(sql)), false);
});

test("the streamer can clear all tasks, completed or not, across every viewer", async () => {
  const database = new FakeDatabase();

  const reply = await runCommand(
    database,
    channelId,
    { id: "streamer-1", username: "streamer", role: "streamer" },
    "!task clear all",
  );

  assert.equal(reply, "Toutes les tâches de la chaîne ont été supprimées.");
  const deletion = database.executions.find(({ sql }) => /DELETE FROM tasks/i.test(sql));
  assert.ok(deletion);
  assert.match(deletion.sql, /WHERE channel_id = \?/i);
  assert.doesNotMatch(deletion.sql, /completed|user_id/i);
  assert.deepEqual(deletion.bindings, [channelId]);
});

test("plain clear still removes only the caller's completed tasks", async () => {
  const database = new FakeDatabase();

  const reply = await runCommand(
    database,
    channelId,
    { id: "viewer-1", username: "viewer", role: "viewer" },
    "!task clear",
  );

  assert.equal(reply, "Vos tâches terminées ont été nettoyées.");
  const deletion = database.executions.find(({ sql }) => /DELETE FROM tasks/i.test(sql));
  assert.ok(deletion);
  assert.match(deletion.sql, /channel_id = \?/i);
  assert.match(deletion.sql, /user_id = \?/i);
  assert.match(deletion.sql, /completed = 1/i);
  assert.deepEqual(deletion.bindings, [channelId, "viewer-1"]);
});
