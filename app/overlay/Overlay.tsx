"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isLanguage, overlayCopy, type Language } from "@/app/i18n";

type OverlayState = {
  channel: { id: string; username: string; connected: boolean };
  timer: {
    currentSession: number;
    totalSessions: number;
    focusDuration: number;
    breakDuration: number;
    status: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
    phase: "FOCUS" | "BREAK";
    remainingSeconds: number;
  };
  tasks: Array<{ id: number; userId: string; username: string; text: string; completed: number | boolean }>;
  branding: {
    hasLogo: boolean;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    size: number;
    updatedAt: string | null;
  };
};

type OverlayTheme = "focus" | "graphite" | "sand" | "ocean" | "plum" | "frost" | "accessible";
const overlayThemeIds: OverlayTheme[] = ["focus", "graphite", "sand", "ocean", "plum", "frost", "accessible"];
type TimerLayout = "classic" | "essential" | "compact" | "centered" | "line" | "outline";
const timerLayoutIds: TimerLayout[] = ["classic", "essential", "compact", "centered", "line", "outline"];

const fallback: OverlayState = {
  channel: { id: "", username: "focus-party", connected: false },
  timer: { currentSession: 1, totalSessions: 5, focusDuration: 25, breakDuration: 5, status: "IDLE", phase: "FOCUS", remainingSeconds: 1500 },
  tasks: [],
  branding: { hasLogo: false, position: "bottom-right", size: 84, updatedAt: null },
};

function formatTime(seconds: number) {
  return `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
}

export default function Overlay() {
  const [state, setState] = useState(fallback);
  const [display, setDisplay] = useState<"timer" | "tasks" | "combined">("combined");
  const [theme, setTheme] = useState<OverlayTheme>("focus");
  const [timerLayout, setTimerLayout] = useState<TimerLayout>("classic");
  const [language, setLanguage] = useState<Language>("fr");
  const taskListRef = useRef<HTMLDivElement>(null);
  const channelId = typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("channel") ?? "";
  const showTimer = display !== "tasks";
  const showTasks = display !== "timer";

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedDisplay = searchParams.get("display");
    const requestedTheme = searchParams.get("theme") as OverlayTheme | null;
    const requestedTimerLayout = searchParams.get("timerStyle") as TimerLayout | null;
    const requestedLanguage = searchParams.get("lang");
    const nextDisplay = requestedDisplay === "timer" || requestedDisplay === "tasks" ? requestedDisplay : "combined";
    const nextTheme = requestedTheme && overlayThemeIds.includes(requestedTheme) ? requestedTheme : "focus";
    const nextTimerLayout = requestedTimerLayout && timerLayoutIds.includes(requestedTimerLayout) ? requestedTimerLayout : "classic";
    const nextLanguage = isLanguage(requestedLanguage) ? requestedLanguage : "fr";
    const updateDisplay = window.setTimeout(() => {
      setDisplay(nextDisplay);
      setTheme(nextTheme);
      setTimerLayout(nextTimerLayout);
      setLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage;
    }, 0);
    return () => window.clearTimeout(updateDisplay);
  }, []);

  const refresh = useCallback(async () => {
    if (!channelId) return;
    try {
      const response = await fetch(`/api/state?channel=${encodeURIComponent(channelId)}`, { cache: "no-store" });
      if (response.ok) setState(await response.json() as OverlayState);
    } catch {
      // The current server value is kept through short reconnects.
    }
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    const initialRefresh = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, 8000);
    const channel = new BroadcastChannel("focus-party-updates");
    channel.onmessage = () => void refresh();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const realtime = new WebSocket(`${protocol}//${window.location.host}/api/realtime?channel=${encodeURIComponent(channelId)}`);
    realtime.onmessage = () => void refresh();
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(poll); channel.close(); realtime.close(); };
  }, [channelId, refresh]);

  useEffect(() => {
    if (state.timer.status !== "RUNNING") return;
    const tick = window.setInterval(() => {
      setState((current) => ({ ...current, timer: { ...current.timer, remainingSeconds: Math.max(0, current.timer.remainingSeconds - 1) } }));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [state.timer.status, state.timer.phase, state.timer.currentSession]);

  const total = (state.timer.phase === "FOCUS" ? state.timer.focusDuration : state.timer.breakDuration) * 60;
  const progress = state.timer.status === "IDLE" ? 0 : Math.min(100, Math.max(0, (1 - state.timer.remainingSeconds / total) * 100));
  const copy = overlayCopy[language];
  const phaseClass = state.timer.status === "PAUSED" ? "paused" : state.timer.status === "IDLE" ? "ready" : state.timer.status === "FINISHED" ? "finished" : state.timer.phase.toLowerCase();
  const label = state.timer.status === "PAUSED" ? copy.paused : state.timer.status === "IDLE" ? copy.ready : state.timer.status === "FINISHED" ? copy.finished : state.timer.phase === "BREAK" ? copy.break : copy.focus;
  const taskGroups = useMemo(() => {
    const groups = new Map<string, { username: string; tasks: OverlayState["tasks"] }>();
    for (const task of state.tasks) {
      const key = task.userId || task.username;
      const existing = groups.get(key);
      if (existing) existing.tasks.push(task);
      else groups.set(key, { username: task.username, tasks: [task] });
    }
    return Array.from(groups.entries()).map(([id, group]) => ({ id, ...group }));
  }, [state.tasks]);
  const taskScrollKey = state.tasks.map((task) => `${task.id}:${Number(Boolean(task.completed))}`).join("|");
  const logoUrl = state.branding.hasLogo && channelId
    ? `/api/logo?channel=${encodeURIComponent(channelId)}&v=${encodeURIComponent(state.branding.updatedAt ?? "logo")}`
    : "";

  useEffect(() => {
    const viewport = taskListRef.current;
    if (!viewport || !showTasks || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    viewport.scrollTop = 0;
    let animationFrame = 0;
    let direction = 1;
    let previousTime = performance.now();
    let pausedUntil = previousTime + 2200;
    const speed = 8;

    const animate = (time: number) => {
      const maximumScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const elapsed = Math.min(64, time - previousTime);
      previousTime = time;
      if (maximumScroll > 1 && time >= pausedUntil) {
        const nextPosition = viewport.scrollTop + direction * speed * (elapsed / 1000);
        if (nextPosition >= maximumScroll) {
          viewport.scrollTop = maximumScroll;
          direction = -1;
          pausedUntil = time + 2200;
        } else if (nextPosition <= 0) {
          viewport.scrollTop = 0;
          direction = 1;
          pausedUntil = time + 2200;
        } else {
          viewport.scrollTop = nextPosition;
        }
      }
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [showTasks, taskScrollKey]);

  return (
    <main className={`obs-canvas obs-display-${display} obs-theme-${theme} obs-layout-${timerLayout} phase-${state.timer.phase.toLowerCase()}`}>
      {showTimer && <section className="obs-widget">
        <div className="obs-topline">
          <div className="obs-brand"><span>✦</span> FOCUS PARTY</div>
          <div className="obs-live"><i /> @{state.channel.username}</div>
        </div>
        <div className="obs-body">
          <div className="obs-session"><span>{copy.session}</span><strong>{state.timer.currentSession}<i>/</i>{state.timer.totalSessions}</strong></div>
          <div className="obs-timer"><strong>{formatTime(state.timer.remainingSeconds)}</strong><span className={`obs-phase ${phaseClass}`}><i />{label}</span></div>
        </div>
        <div className="obs-progress"><i style={{ width: `${progress}%` }} /></div>
        <div className="obs-footer">
          <span>{state.timer.phase === "FOCUS" ? copy.nextBreak : copy.nextFocus} <strong>{state.timer.phase === "FOCUS" ? state.timer.breakDuration : state.timer.focusDuration} min</strong></span>
          <span>{Math.round(progress)}% {copy.completed}</span>
        </div>
      </section>}
      {showTasks && (
        <section className="obs-tasks">
          <header className="obs-task-header"><span><small>{copy.chatGoals}</small><strong>{copy.taskList}</strong></span><em>{state.tasks.length} {state.tasks.length > 1 ? copy.tasks : copy.task}</em></header>
          <div className="obs-task-scroll" ref={taskListRef}>
            {taskGroups.length ? taskGroups.map((group) => (
              <section className="obs-task-group" key={group.id}>
                <header><span>{group.username.slice(0, 1).toUpperCase()}</span><strong>{group.username}</strong></header>
                {group.tasks.map((task, index) => (
                  <div className={`obs-task-row ${task.completed ? "done" : ""}`} key={task.id}>
                    <i>{task.completed ? "✓" : ""}</i><small>{index + 1}</small><strong>{task.text}</strong>
                  </div>
                ))}
              </section>
            )) : <p className="obs-task-empty">{copy.empty}</p>}
          </div>
        </section>
      )}
      {logoUrl && <i className={`obs-custom-logo obs-logo-${state.branding.position}`} role="img" aria-label={copy.logo} style={{ width: `${state.branding.size}px`, height: `${state.branding.size}px`, backgroundImage: `url(${logoUrl})` }} />}
    </main>
  );
}
