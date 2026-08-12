"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type OverlayState = {
  channel: { username: string };
  timer: {
    currentSession: number;
    totalSessions: number;
    focusDuration: number;
    breakDuration: number;
    status: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
    phase: "FOCUS" | "BREAK";
    remainingSeconds: number;
  };
  tasks: Array<{ id: number; username: string; text: string; completed: number | boolean }>;
};

const fallback: OverlayState = {
  channel: { username: "noctua_dev" },
  timer: { currentSession: 1, totalSessions: 5, focusDuration: 25, breakDuration: 5, status: "IDLE", phase: "FOCUS", remainingSeconds: 1500 },
  tasks: [],
};

function formatTime(seconds: number) {
  return `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
}

export default function Overlay() {
  const [state, setState] = useState(fallback);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.ok) setState(await response.json() as OverlayState);
    } catch {
      // The current server value is kept through short reconnects.
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, 8000);
    const channel = new BroadcastChannel("focus-party-updates");
    channel.onmessage = () => void refresh();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const realtime = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
    realtime.onmessage = () => void refresh();
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(poll); channel.close(); realtime.close(); };
  }, [refresh]);

  useEffect(() => {
    if (state.timer.status !== "RUNNING") return;
    const tick = window.setInterval(() => {
      setState((current) => ({ ...current, timer: { ...current.timer, remainingSeconds: Math.max(0, current.timer.remainingSeconds - 1) } }));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [state.timer.status, state.timer.phase, state.timer.currentSession]);

  const total = (state.timer.phase === "FOCUS" ? state.timer.focusDuration : state.timer.breakDuration) * 60;
  const progress = state.timer.status === "IDLE" ? 0 : Math.min(100, Math.max(0, (1 - state.timer.remainingSeconds / total) * 100));
  const label = useMemo(() => state.timer.status === "PAUSED" ? "PAUSED" : state.timer.status === "IDLE" ? "READY" : state.timer.status === "FINISHED" ? "FINISHED" : state.timer.phase, [state.timer]);
  const recentTasks = state.tasks.filter((task) => !task.completed).slice(0, 2);

  return (
    <main className={`obs-canvas phase-${state.timer.phase.toLowerCase()}`}>
      <section className="obs-widget">
        <div className="obs-topline">
          <div className="obs-brand"><span>✦</span> FOCUS PARTY</div>
          <div className="obs-live"><i /> @{state.channel.username}</div>
        </div>
        <div className="obs-body">
          <div className="obs-session"><span>SESSION</span><strong>{state.timer.currentSession}<i>/</i>{state.timer.totalSessions}</strong></div>
          <div className="obs-timer"><strong>{formatTime(state.timer.remainingSeconds)}</strong><span className={`obs-phase ${label.toLowerCase()}`}><i />{label}</span></div>
        </div>
        <div className="obs-progress"><i style={{ width: `${progress}%` }} /></div>
        <div className="obs-footer">
          <span>{state.timer.phase === "FOCUS" ? "Prochaine pause" : "Prochain focus"} <strong>{state.timer.phase === "FOCUS" ? state.timer.breakDuration : state.timer.focusDuration} min</strong></span>
          <span>{Math.round(progress)}% complété</span>
        </div>
      </section>
      {recentTasks.length > 0 && (
        <section className="obs-tasks">
          <span className="obs-task-title">OBJECTIFS DU CHAT</span>
          {recentTasks.map((task) => <div key={task.id}><i /> <p><strong>{task.text}</strong><span>@{task.username}</span></p></div>)}
        </section>
      )}
    </main>
  );
}
