import { env } from "cloudflare:workers";

const DEMO_CHANNEL = "demo-channel";
const cooldowns = new Map<string, number>();

type Role = "streamer" | "moderator" | "viewer";
type Actor = { id: string; username: string; role: Role };
type TimerRow = {
  channel_id: string;
  current_session: number;
  total_sessions: number;
  focus_duration: number;
  break_duration: number;
  status: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
  phase: "FOCUS" | "BREAK";
  remaining_seconds: number;
  phase_started_at: number | null;
  updated_at: string;
};

const schemas = [
  `CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY, twitch_channel_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL,
    display_name TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, twitch_user_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, user_id TEXT NOT NULL,
    username TEXT NOT NULL, text TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_channel_user ON tasks(channel_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    channel_id TEXT PRIMARY KEY, current_session INTEGER NOT NULL, total_sessions INTEGER NOT NULL,
    focus_duration INTEGER NOT NULL, break_duration INTEGER NOT NULL, status TEXT NOT NULL,
    phase TEXT NOT NULL, remaining_seconds INTEGER NOT NULL, phase_started_at INTEGER, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS processed_events (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_processed_events_expiry ON processed_events(expires_at)`,
];

function db() {
  if (!env.DB) throw new Error("La base de données DB n’est pas configurée.");
  return env.DB;
}

async function ensureDemoData() {
  const database = db();
  await database.batch(schemas.map((statement) => database.prepare(statement)));
  const now = new Date().toISOString();
  await database.batch([
    database.prepare(
      "INSERT OR IGNORE INTO channels (id, twitch_channel_id, username, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(DEMO_CHANNEL, "87420159", "noctua_dev", "Noctua", now),
    database.prepare(
      "INSERT OR IGNORE INTO users (id, twitch_user_id, username) VALUES (?, ?, ?)",
    ).bind("streamer", "87420159", "noctua_dev"),
    database.prepare(
      "INSERT OR IGNORE INTO users (id, twitch_user_id, username) VALUES (?, ?, ?)",
    ).bind("viewer-lina", "22419912", "lina_codes"),
    database.prepare(
      `INSERT OR IGNORE INTO pomodoro_sessions
       (channel_id, current_session, total_sessions, focus_duration, break_duration, status, phase, remaining_seconds, phase_started_at, updated_at)
       VALUES (?, 1, 5, 25, 5, 'IDLE', 'FOCUS', 1500, NULL, ?)`,
    ).bind(DEMO_CHANNEL, now),
  ]);

  const count = await database.prepare(
    "SELECT COUNT(*) AS total FROM tasks WHERE channel_id = ?",
  ).bind(DEMO_CHANNEL).first<{ total: number }>();
  if (!count?.total) {
    await database.batch([
      database.prepare(
        "INSERT INTO tasks (channel_id, user_id, username, text, completed, created_at, completed_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      ).bind(DEMO_CHANNEL, "viewer-lina", "lina_codes", "Finaliser la maquette du portfolio", now, now),
      database.prepare(
        "INSERT INTO tasks (channel_id, user_id, username, text, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
      ).bind(DEMO_CHANNEL, "viewer-milo", "milo_builds", "Corriger le formulaire de contact", now),
      database.prepare(
        "INSERT INTO tasks (channel_id, user_id, username, text, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
      ).bind(DEMO_CHANNEL, "viewer-lina", "lina_codes", "Écrire les tests du composant Timer", now),
    ]);
  }
}

async function getTimer(channelId = DEMO_CHANNEL): Promise<TimerRow> {
  const database = db();
  const row = await database.prepare(
    "SELECT * FROM pomodoro_sessions WHERE channel_id = ?",
  ).bind(channelId).first<TimerRow>();
  if (!row) throw new Error("Session Pomodoro introuvable.");
  if (row.status !== "RUNNING" || !row.phase_started_at) return row;

  const now = Math.floor(Date.now() / 1000);
  let elapsed = Math.max(0, now - row.phase_started_at);
  let remaining = row.remaining_seconds;
  let phase = row.phase;
  let current = row.current_session;
  let status = row.status;
  let changedPhase = false;

  while (status === "RUNNING" && elapsed >= remaining) {
    elapsed -= remaining;
    changedPhase = true;
    if (phase === "FOCUS" && current >= row.total_sessions) {
      status = "FINISHED";
      remaining = 0;
      elapsed = 0;
    } else if (phase === "FOCUS") {
      phase = "BREAK";
      remaining = row.break_duration * 60;
    } else {
      phase = "FOCUS";
      current += 1;
      remaining = row.focus_duration * 60;
    }
  }

  remaining = Math.max(0, remaining - elapsed);
  const computed = {
    ...row,
    current_session: current,
    status,
    phase,
    remaining_seconds: remaining,
    phase_started_at: status === "RUNNING" ? (changedPhase ? now : row.phase_started_at) : null,
  };

  if (changedPhase) {
    await database.prepare(
      `UPDATE pomodoro_sessions SET current_session = ?, status = ?, phase = ?, remaining_seconds = ?,
       phase_started_at = ?, updated_at = ? WHERE channel_id = ?`,
    ).bind(current, status, phase, remaining, computed.phase_started_at, new Date().toISOString(), channelId).run();
  }
  return computed;
}

async function getState(channelId = DEMO_CHANNEL) {
  const database = db();
  const timer = await getTimer(channelId);
  const tasks = await database.prepare(
    `SELECT id, user_id AS userId, username, text, completed, created_at AS createdAt
     FROM tasks WHERE channel_id = ? ORDER BY completed ASC, id DESC LIMIT 30`,
  ).bind(channelId).all();
  return {
    channel: { id: channelId, username: "noctua_dev", displayName: "Noctua", connected: true },
    timer: {
      currentSession: timer.current_session,
      totalSessions: timer.total_sessions,
      focusDuration: timer.focus_duration,
      breakDuration: timer.break_duration,
      status: timer.status,
      phase: timer.phase,
      remainingSeconds: timer.remaining_seconds,
    },
    tasks: tasks.results,
  };
}

async function configure(channelId: string, payload: Record<string, unknown>) {
  const timer = await getTimer(channelId);
  const focus = Math.max(1, Math.min(120, Number(payload.focusDuration ?? timer.focus_duration)));
  const rest = Math.max(1, Math.min(60, Number(payload.breakDuration ?? timer.break_duration)));
  const total = Math.max(1, Math.min(20, Number(payload.totalSessions ?? timer.total_sessions)));
  const remaining = timer.status === "IDLE" || timer.status === "FINISHED" ? focus * 60 : timer.remaining_seconds;
  await db().prepare(
    `UPDATE pomodoro_sessions SET focus_duration = ?, break_duration = ?, total_sessions = ?,
     remaining_seconds = ?, updated_at = ? WHERE channel_id = ?`,
  ).bind(focus, rest, total, remaining, new Date().toISOString(), channelId).run();
}

async function timerAction(channelId: string, action: string) {
  const database = db();
  const timer = await getTimer(channelId);
  const now = Math.floor(Date.now() / 1000);
  const stamp = new Date().toISOString();
  if (action === "start") {
    await database.prepare(
      `UPDATE pomodoro_sessions SET current_session = 1, status = 'RUNNING', phase = 'FOCUS',
       remaining_seconds = focus_duration * 60, phase_started_at = ?, updated_at = ? WHERE channel_id = ?`,
    ).bind(now, stamp, channelId).run();
  } else if (action === "pause" && timer.status === "RUNNING") {
    await database.prepare(
      "UPDATE pomodoro_sessions SET status = 'PAUSED', remaining_seconds = ?, phase_started_at = NULL, updated_at = ? WHERE channel_id = ?",
    ).bind(timer.remaining_seconds, stamp, channelId).run();
  } else if (action === "resume" && timer.status === "PAUSED") {
    await database.prepare(
      "UPDATE pomodoro_sessions SET status = 'RUNNING', phase_started_at = ?, updated_at = ? WHERE channel_id = ?",
    ).bind(now, stamp, channelId).run();
  } else if (action === "stop") {
    await database.prepare(
      `UPDATE pomodoro_sessions SET current_session = 1, status = 'IDLE', phase = 'FOCUS',
       remaining_seconds = focus_duration * 60, phase_started_at = NULL, updated_at = ? WHERE channel_id = ?`,
    ).bind(stamp, channelId).run();
  }
}

function assertStreamer(actor: Actor) {
  if (actor.role !== "streamer") throw new Error("Cette commande est réservée au streamer.");
}

async function runCommand(channelId: string, actor: Actor, message: string) {
  const [rawCommand, rawSub = "", ...args] = message.trim().split(/\s+/);
  const command = rawCommand?.toLowerCase();
  const sub = rawSub.toLowerCase();
  if (!command?.startsWith("!")) throw new Error("Commencez par une commande : !pomo, !timer ou !task.");

  const cooldownKey = `${channelId}:${actor.id}:${command}`;
  const lastUsed = cooldowns.get(cooldownKey) ?? 0;
  if (Date.now() - lastUsed < 900) throw new Error("Doucement — cette commande est en cooldown.");
  cooldowns.set(cooldownKey, Date.now());

  const handlers: Record<string, () => Promise<string>> = {
    "!pomo": async () => {
      if (sub === "status" || !sub) {
        const timer = await getTimer(channelId);
        return `Session ${timer.current_session}/${timer.total_sessions} · ${timer.phase} · ${Math.ceil(timer.remaining_seconds / 60)} min restantes`;
      }
      assertStreamer(actor);
      if (/^\d+$/.test(sub)) {
        await configure(channelId, { totalSessions: Number(sub) });
        return `${sub} sessions configurées.`;
      }
      if (!["start", "pause", "resume", "stop"].includes(sub)) throw new Error("Utilisez !pomo start, pause, resume, stop ou status.");
      await timerAction(channelId, sub);
      return sub === "start" ? "C’est parti — bon focus à tous !" : `Pomodoro : ${sub}.`;
    },
    "!timer": async () => {
      assertStreamer(actor);
      const match = rawSub.match(/^(\d{1,3})\/(\d{1,2})$/);
      if (!match) throw new Error("Format attendu : !timer 25/5");
      await configure(channelId, { focusDuration: Number(match[1]), breakDuration: Number(match[2]) });
      return `Timer réglé sur ${match[1]} min de focus / ${match[2]} min de pause.`;
    },
    "!task": async () => {
      const database = db();
      await database.prepare(
        "INSERT OR IGNORE INTO users (id, twitch_user_id, username) VALUES (?, ?, ?)",
      ).bind(actor.id, actor.id, actor.username).run();
      if (!sub) {
        const own = await database.prepare(
          "SELECT text, completed FROM tasks WHERE channel_id = ? AND user_id = ? ORDER BY id ASC",
        ).bind(channelId, actor.id).all<{ text: string; completed: number }>();
        if (!own.results.length) return "Votre liste est vide. Ajoutez une tâche avec !task add …";
        return own.results.map((task, index) => `${index + 1}. ${task.completed ? "✅" : "⬜"} ${task.text}`).join(" · ");
      }
      if (sub === "add") {
        const text = args.join(" ").trim();
        if (!text) throw new Error("Ajoutez le texte de la tâche après !task add.");
        if (text.length > 120) throw new Error("Une tâche ne peut pas dépasser 120 caractères.");
        const count = await database.prepare(
          "SELECT COUNT(*) AS total FROM tasks WHERE channel_id = ? AND user_id = ?",
        ).bind(channelId, actor.id).first<{ total: number }>();
        if ((count?.total ?? 0) >= 15) throw new Error("Vous avez atteint la limite de 15 tâches.");
        await database.prepare(
          "INSERT INTO tasks (channel_id, user_id, username, text, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
        ).bind(channelId, actor.id, actor.username, text, new Date().toISOString()).run();
        return `Tâche ajoutée : ${text}`;
      }
      if (sub === "clear" && args[0]?.toLowerCase() === "all") {
        assertStreamer(actor);
        await database.prepare("DELETE FROM tasks WHERE channel_id = ? AND completed = 1").bind(channelId).run();
        return "Toutes les tâches terminées ont été nettoyées.";
      }
      if (sub === "clear") {
        await database.prepare("DELETE FROM tasks WHERE channel_id = ? AND user_id = ? AND completed = 1").bind(channelId, actor.id).run();
        return "Vos tâches terminées ont été nettoyées.";
      }
      if ((sub === "done" || sub === "remove") && /^\d+$/.test(args[0] ?? "")) {
        const position = Number(args[0]);
        const selected = await database.prepare(
          "SELECT id, text FROM tasks WHERE channel_id = ? AND user_id = ? ORDER BY id ASC LIMIT 1 OFFSET ?",
        ).bind(channelId, actor.id, position - 1).first<{ id: number; text: string }>();
        if (!selected) throw new Error("Ce numéro de tâche n’existe pas dans votre liste.");
        if (sub === "done") {
          await database.prepare("UPDATE tasks SET completed = 1, completed_at = ? WHERE id = ? AND user_id = ?").bind(new Date().toISOString(), selected.id, actor.id).run();
          return `Bravo ! « ${selected.text} » est terminée.`;
        }
        await database.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").bind(selected.id, actor.id).run();
        return `Tâche supprimée : ${selected.text}`;
      }
      throw new Error("Commande tâche inconnue. Essayez !task add, done, remove ou clear.");
    },
  };

  const handler = handlers[command];
  if (!handler) throw new Error("Commande inconnue. Essayez !pomo, !timer ou !task.");
  return handler();
}

export async function GET() {
  try {
    await ensureDemoData();
    return Response.json(await getState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDemoData();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const channelId = String(payload.channelId ?? DEMO_CHANNEL);
    let reply = "Mise à jour enregistrée.";
    if (["start", "pause", "resume", "stop"].includes(action)) {
      await timerAction(channelId, action);
    } else if (action === "configure") {
      await configure(channelId, payload);
      reply = "Configuration enregistrée.";
    } else if (action === "command") {
      const actor = payload.actor as Actor;
      if (!actor?.id || !actor?.username || !actor?.role) throw new Error("Utilisateur Twitch invalide.");
      reply = await runCommand(channelId, actor, String(payload.message ?? ""));
    } else {
      throw new Error("Action inconnue.");
    }
    return Response.json({ reply, state: await getState(channelId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return Response.json({ error: message }, { status: message.includes("cooldown") ? 429 : 400 });
  }
}
