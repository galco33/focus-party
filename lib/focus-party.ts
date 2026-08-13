import { defaultBranding, getBranding } from "@/lib/branding";

export type Role = "streamer" | "moderator" | "viewer";

export type Actor = {
  id: string;
  username: string;
  role: Role;
};

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

type ChannelRow = {
  id: string;
  twitch_channel_id: string;
  username: string;
  display_name: string;
  eventsub_status: string | null;
};

type ChatEventRow = {
  id: number;
  username: string;
  role: Role;
  message: string;
  reply: string | null;
  created_at: string;
};

export function disconnectedState() {
  return {
    channel: {
      id: "",
      username: "",
      displayName: "",
      connected: false,
      chatConnected: false,
      eventSubStatus: "disconnected",
    },
    timer: {
      currentSession: 1,
      totalSessions: 5,
      focusDuration: 25,
      breakDuration: 5,
      status: "IDLE" as const,
      phase: "FOCUS" as const,
      remainingSeconds: 1500,
    },
    tasks: [],
    recentChat: [],
    branding: defaultBranding,
  };
}

export async function ensureChannelTimer(database: D1Database, channelId: string) {
  const now = new Date().toISOString();
  await database.prepare(
    `INSERT OR IGNORE INTO pomodoro_sessions
     (channel_id, current_session, total_sessions, focus_duration, break_duration, status, phase, remaining_seconds, phase_started_at, updated_at)
     VALUES (?, 1, 5, 25, 5, 'IDLE', 'FOCUS', 1500, NULL, ?)`,
  ).bind(channelId, now).run();
}

async function getTimer(database: D1Database, channelId: string): Promise<TimerRow> {
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
  let status: TimerRow["status"] = row.status;
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
  const phaseStartedAt = status === "RUNNING"
    ? changedPhase ? now : row.phase_started_at
    : null;

  if (changedPhase) {
    await database.prepare(
      `UPDATE pomodoro_sessions SET current_session = ?, status = ?, phase = ?, remaining_seconds = ?,
       phase_started_at = ?, updated_at = ? WHERE channel_id = ?`,
    ).bind(current, status, phase, remaining, phaseStartedAt, new Date().toISOString(), channelId).run();
  }

  return {
    ...row,
    current_session: current,
    status,
    phase,
    remaining_seconds: remaining,
    phase_started_at: phaseStartedAt,
  };
}

export async function getState(database: D1Database, channelId: string) {
  const channel = await database.prepare(
    `SELECT id, twitch_channel_id, username, display_name, eventsub_status
     FROM channels WHERE id = ?`,
  ).bind(channelId).first<ChannelRow>();
  if (!channel) return disconnectedState();

  await ensureChannelTimer(database, channelId);
  const [timer, tasks, chat, branding] = await Promise.all([
    getTimer(database, channelId),
    database.prepare(
      `SELECT id, user_id AS userId, username, text, completed, focused, created_at AS createdAt
       FROM tasks WHERE channel_id = ? ORDER BY id ASC LIMIT 30`,
    ).bind(channelId).all(),
    database.prepare(
      `SELECT id, username, role, message, reply, created_at
       FROM chat_events WHERE channel_id = ? ORDER BY id DESC LIMIT 12`,
    ).bind(channelId).all<ChatEventRow>(),
    getBranding(database, channelId),
  ]);

  return {
    channel: {
      id: channel.id,
      username: channel.username,
      displayName: channel.display_name,
      connected: true,
      chatConnected: channel.eventsub_status === "enabled",
      eventSubStatus: channel.eventsub_status ?? "pending",
    },
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
    recentChat: [...chat.results].reverse().map((entry) => ({
      id: entry.id,
      username: entry.username,
      role: entry.role,
      message: entry.message,
      reply: entry.reply,
      createdAt: entry.created_at,
    })),
    branding,
  };
}

export async function configureTimer(
  database: D1Database,
  channelId: string,
  payload: Record<string, unknown>,
) {
  const timer = await getTimer(database, channelId);
  const focus = Math.max(1, Math.min(120, Number(payload.focusDuration ?? timer.focus_duration)));
  const rest = Math.max(1, Math.min(60, Number(payload.breakDuration ?? timer.break_duration)));
  const total = Math.max(1, Math.min(20, Number(payload.totalSessions ?? timer.total_sessions)));
  const remaining = timer.status === "IDLE" || timer.status === "FINISHED"
    ? focus * 60
    : timer.remaining_seconds;
  await database.prepare(
    `UPDATE pomodoro_sessions SET focus_duration = ?, break_duration = ?, total_sessions = ?,
     remaining_seconds = ?, updated_at = ? WHERE channel_id = ?`,
  ).bind(focus, rest, total, remaining, new Date().toISOString(), channelId).run();
}

export async function timerAction(database: D1Database, channelId: string, action: string) {
  const timer = await getTimer(database, channelId);
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
  if (actor.role !== "streamer") {
    throw new Error("Cette commande est réservée au streamer.");
  }
}

async function claimCooldown(database: D1Database, channelId: string, actor: Actor, command: string) {
  const now = Date.now();
  const allowedBefore = now - 900;
  const claimed = await database.prepare(
    `INSERT INTO command_cooldowns (channel_id, user_id, command, last_used_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(channel_id, user_id, command) DO UPDATE SET last_used_at = excluded.last_used_at
     WHERE command_cooldowns.last_used_at <= ?
     RETURNING last_used_at`,
  ).bind(channelId, actor.id, command, now, allowedBefore).first<{ last_used_at: number }>();
  if (!claimed) throw new Error("Doucement — cette commande est en cooldown.");
}

export async function runCommand(
  database: D1Database,
  channelId: string,
  actor: Actor,
  message: string,
) {
  const [rawCommand, rawSub = "", ...args] = message.trim().split(/\s+/);
  const command = rawCommand?.toLowerCase();
  const sub = rawSub.toLowerCase();
  if (!command?.startsWith("!")) throw new Error("Ce message n’est pas une commande.");
  await claimCooldown(database, channelId, actor, command);

  const handlers: Record<string, () => Promise<string>> = {
    "!pomo": async () => {
      if (sub === "status" || !sub) {
        const timer = await getTimer(database, channelId);
        return `Session ${timer.current_session}/${timer.total_sessions} · ${timer.phase} · ${Math.ceil(timer.remaining_seconds / 60)} min restantes`;
      }
      assertStreamer(actor);
      if (/^\d+$/.test(sub)) {
        await configureTimer(database, channelId, { totalSessions: Number(sub) });
        return `${sub} sessions configurées.`;
      }
      if (!["start", "pause", "resume", "stop"].includes(sub)) {
        throw new Error("Utilisez !pomo start, pause, resume, stop ou status.");
      }
      await timerAction(database, channelId, sub);
      return sub === "start" ? "C’est parti — bon focus à tous !" : `Pomodoro : ${sub}.`;
    },
    "!timer": async () => {
      assertStreamer(actor);
      const match = rawSub.match(/^(\d{1,3})\/(\d{1,2})$/);
      if (!match) throw new Error("Format attendu : !timer 25/5");
      await configureTimer(database, channelId, {
        focusDuration: Number(match[1]),
        breakDuration: Number(match[2]),
      });
      return `Timer réglé sur ${match[1]} min de focus / ${match[2]} min de pause.`;
    },
    "!taskhelp": async () => (
      "Commandes Task List : !task · !task add … · !task focus 1 · !task edit 1 … · !task done 1 · !task remove 1 · !task clear"
    ),
    "!task": async () => {
      await database.prepare(
        "INSERT OR IGNORE INTO users (id, twitch_user_id, username) VALUES (?, ?, ?)",
      ).bind(actor.id, actor.id, actor.username).run();
      if (!sub) {
        const own = await database.prepare(
          "SELECT text, completed, focused FROM tasks WHERE channel_id = ? AND user_id = ? ORDER BY id ASC",
        ).bind(channelId, actor.id).all<{ text: string; completed: number; focused: number }>();
        if (!own.results.length) return "Votre liste est vide. Ajoutez une tâche avec !task add …";
        return own.results
          .map((task, index) => `${index + 1}. ${task.completed ? "✅" : task.focused ? "🎯" : "⬜"} ${task.text}`)
          .join(" · ");
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
        await database.prepare(
          "DELETE FROM tasks WHERE channel_id = ? AND completed = 1",
        ).bind(channelId).run();
        return "Toutes les tâches terminées ont été nettoyées.";
      }
      if (sub === "clear") {
        await database.prepare(
          "DELETE FROM tasks WHERE channel_id = ? AND user_id = ? AND completed = 1",
        ).bind(channelId, actor.id).run();
        return "Vos tâches terminées ont été nettoyées.";
      }
      if (["focus", "edit", "done", "remove"].includes(sub) && /^\d+$/.test(args[0] ?? "")) {
        const position = Number(args[0]);
        const selected = await database.prepare(
          "SELECT id, text, completed FROM tasks WHERE channel_id = ? AND user_id = ? ORDER BY id ASC LIMIT 1 OFFSET ?",
        ).bind(channelId, actor.id, position - 1).first<{ id: number; text: string; completed: number }>();
        if (!selected) throw new Error("Ce numéro de tâche n’existe pas dans votre liste.");
        if (sub === "focus") {
          if (selected.completed) throw new Error("Une tâche terminée ne peut pas devenir la tâche active.");
          await database.batch([
            database.prepare(
              "UPDATE tasks SET focused = 0 WHERE channel_id = ? AND user_id = ?",
            ).bind(channelId, actor.id),
            database.prepare(
              "UPDATE tasks SET focused = 1 WHERE id = ? AND channel_id = ? AND user_id = ?",
            ).bind(selected.id, channelId, actor.id),
          ]);
          return `Tâche active : « ${selected.text} ».`;
        }
        if (sub === "edit") {
          const nextText = args.slice(1).join(" ").trim();
          if (!nextText) throw new Error("Ajoutez le nouveau texte après !task edit 1.");
          if (nextText.length > 120) throw new Error("Une tâche ne peut pas dépasser 120 caractères.");
          await database.prepare(
            "UPDATE tasks SET text = ? WHERE id = ? AND channel_id = ? AND user_id = ?",
          ).bind(nextText, selected.id, channelId, actor.id).run();
          return `Tâche modifiée : « ${nextText} ».`;
        }
        if (sub === "done") {
          await database.prepare(
            "UPDATE tasks SET completed = 1, focused = 0, completed_at = ? WHERE id = ? AND channel_id = ? AND user_id = ?",
          ).bind(new Date().toISOString(), selected.id, channelId, actor.id).run();
          return `Bravo ! « ${selected.text} » est terminée.`;
        }
        await database.prepare(
          "DELETE FROM tasks WHERE id = ? AND channel_id = ? AND user_id = ?",
        ).bind(selected.id, channelId, actor.id).run();
        return `Tâche supprimée : ${selected.text}`;
      }
      throw new Error("Commande tâche inconnue. Essayez !task add, focus, edit, done, remove ou clear.");
    },
  };

  const handler = handlers[command];
  if (!handler) throw new Error("Commande inconnue. Essayez !pomo, !timer ou !task.");
  return handler();
}

export async function recordChatEvent(
  database: D1Database,
  event: {
    twitchMessageId: string;
    channelId: string;
    actor: Actor;
    message: string;
    reply: string;
  },
) {
  await database.prepare(
    `INSERT OR IGNORE INTO chat_events
     (twitch_message_id, channel_id, user_id, username, role, message, reply, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    event.twitchMessageId,
    event.channelId,
    event.actor.id,
    event.actor.username,
    event.actor.role,
    event.message,
    event.reply,
    new Date().toISOString(),
  ).run();
}

export async function claimEvent(database: D1Database, eventId: string) {
  const now = Date.now();
  await database.prepare("DELETE FROM processed_events WHERE expires_at < ?").bind(now).run();
  const result = await database.prepare(
    "INSERT OR IGNORE INTO processed_events (id, expires_at) VALUES (?, ?)",
  ).bind(eventId, now + 24 * 60 * 60 * 1000).run();
  return result.meta.changes === 1;
}
