import assert from "node:assert/strict";
import test from "node:test";

import { configureTimer, getDisplayedSession, runCommand } from "../lib/focus-party.ts";

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
    if (this.sql.includes("SELECT * FROM pomodoro_sessions")) {
      return this.database.timer;
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
    this.timer = {
      channel_id: channelId,
      current_session: 5,
      total_sessions: 5,
      focus_duration: 25,
      break_duration: 5,
      status: "FINISHED",
      phase: "FOCUS",
      remaining_seconds: 0,
      phase_started_at: null,
      updated_at: "2026-09-22T00:00:00.000Z",
    };
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

const channelId = "channel-focus-party";

test("the session counter starts at zero and keeps active progress", () => {
  assert.equal(getDisplayedSession({ current_session: 1, status: "IDLE" }), 0);
  assert.equal(getDisplayedSession({ current_session: 1, status: "RUNNING" }), 1);
  assert.equal(getDisplayedSession({ current_session: 4, status: "PAUSED" }), 4);
  assert.equal(getDisplayedSession({ current_session: 8, status: "FINISHED" }), 8);
});

test("configuring a finished timer prepares a new run at zero", async () => {
  const database = new FakeDatabase();

  await configureTimer(database, channelId, { totalSessions: 8 });

  const update = database.executions.find(({ sql }) => /UPDATE pomodoro_sessions/i.test(sql));
  assert.ok(update);
  assert.match(update.sql, /current_session = 0/i);
  assert.match(update.sql, /status = 'IDLE'/i);
  assert.match(update.sql, /phase = 'FOCUS'/i);
  assert.deepEqual(update.bindings.slice(0, 4), [25, 5, 8, 1500]);
});

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
