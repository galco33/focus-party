"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isLanguage, languageOptions, siteCopy, type Language } from "@/app/i18n";
import { playTimerChime } from "@/lib/timer-chime";

type Timer = {
  currentSession: number;
  totalSessions: number;
  focusDuration: number;
  breakDuration: number;
  status: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
  phase: "FOCUS" | "BREAK";
  remainingSeconds: number;
};

type Task = {
  id: number;
  userId: string;
  username: string;
  text: string;
  completed: number | boolean;
  focused: number | boolean;
};

type ChatEvent = {
  id: number;
  username: string;
  role: "streamer" | "moderator" | "viewer";
  message: string;
  reply: string | null;
};

type AppState = {
  channel: {
    id: string;
    username: string;
    displayName: string;
    connected: boolean;
    chatConnected: boolean;
    eventSubStatus: string;
  };
  timer: Timer;
  tasks: Task[];
  recentChat: ChatEvent[];
  branding: {
    hasLogo: boolean;
    filename: string | null;
    position: LogoPosition;
    size: number;
    updatedAt: string | null;
  };
};

type OverlayMode = "timer" | "tasks" | "combined";
type OverlayTheme = "focus" | "graphite" | "sand" | "ocean" | "plum" | "frost" | "accessible";
type TimerLayout = "classic" | "essential" | "compact" | "centered" | "line" | "outline";
type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type VisualTheme = "standard" | "colorblind";

const overlayThemes: Array<{ id: OverlayTheme; colors: [string, string, string] }> = [
  { id: "focus", colors: ["#171421", "#d9f573", "#fffef9"] },
  { id: "graphite", colors: ["#18191b", "#e5e7eb", "#f5f5f4"] },
  { id: "sand", colors: ["#2e2720", "#e7c99c", "#f9f5ee"] },
  { id: "ocean", colors: ["#0e232b", "#8fd3c7", "#eff7f6"] },
  { id: "plum", colors: ["#261927", "#d8b4d8", "#f9f3f8"] },
  { id: "frost", colors: ["#eaf0f4", "#547b8f", "#fafcfd"] },
  { id: "accessible", colors: ["#102a43", "#f0e442", "#56b4e9"] },
];

const timerLayouts: TimerLayout[] = ["classic", "essential", "compact", "centered", "line", "outline"];
const FALLBACK_REFRESH_MS = 5 * 60 * 1000;
const REALTIME_RECONNECT_MS = 5000;

const logoPositionOptions: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

const fallbackState: AppState = {
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
    status: "IDLE",
    phase: "FOCUS",
    remainingSeconds: 1500,
  },
  tasks: [],
  recentChat: [],
  branding: { hasLogo: false, filename: null, position: "bottom-right", size: 84, updatedAt: null },
};

const commandGroups = [
  { command: "!pomo 5", access: "streamer" },
  { command: "!timer 25/5", access: "streamer" },
  { command: "!pomo start", access: "streamer" },
  { command: "!pomo pause", access: "streamer" },
  { command: "!pomo status", access: "everyone" },
  { command: "!task", access: "everyone" },
  { command: "!taskhelp", access: "everyone" },
  { command: "!task add …", access: "everyone" },
  { command: "!task focus 1", access: "everyone" },
  { command: "!task edit 1 …", access: "everyone" },
  { command: "!task done 1", access: "everyone" },
  { command: "!task remove 1", access: "everyone" },
  { command: "!task clear", access: "everyone" },
  { command: "!task clear all", access: "streamer" },
];

function groupTasksByParticipant(tasks: Task[]) {
  const groups = new Map<string, { userId: string; username: string; tasks: Task[] }>();

  for (const task of tasks) {
    const key = task.userId || task.username;
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(key, { userId: key, username: task.username, tasks: [task] });
    }
  }

  return Array.from(groups.values());
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    dashboard: "⌂",
    overlay: "▣",
    commands: "⌘",
    settings: "⚙",
    timer: "◷",
    tasks: "✓",
    chat: "#",
    copy: "⧉",
  };
  return <span className="icon" aria-hidden="true">{icons[name] ?? "•"}</span>;
}

function StatusPill({ timer, copy }: { timer: Timer; copy: (typeof siteCopy)[Language] }) {
  const label = timer.status === "IDLE"
    ? copy.statusReady
    : timer.status === "FINISHED"
      ? copy.statusFinished
      : timer.status === "PAUSED"
        ? copy.statusPaused
        : timer.phase === "FOCUS" ? copy.focus.toUpperCase() : copy.break.toUpperCase();
  return <span className={`status-pill status-${timer.status.toLowerCase()}`}><i />{label}</span>;
}

export default function Dashboard() {
  const [state, setState] = useState<AppState>(fallbackState);
  const [activeView, setActiveView] = useState("dashboard");
  const [language, setLanguage] = useState<Language>("fr");
  const [visualTheme, setVisualTheme] = useState<VisualTheme>("standard");
  const [focus, setFocus] = useState(25);
  const [rest, setRest] = useState(5);
  const [sessions, setSessions] = useState(5);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedOverlay, setCopiedOverlay] = useState<OverlayMode | null>(null);
  const [previewOverlay, setPreviewOverlay] = useState<OverlayMode>("combined");
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>("focus");
  const [timerLayout, setTimerLayout] = useState<TimerLayout>("classic");
  const [overlaySound, setOverlaySound] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("bottom-right");
  const [logoSize, setLogoSize] = useState(84);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);
  const taskScrollPausedRef = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const brandingRevisionRef = useRef<string | null | undefined>(undefined);
  const previousRemainingSecondsRef = useRef(fallbackState.timer.remainingSeconds);
  const copy = siteCopy[language];

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const applyState = useCallback((next: AppState) => {
    setState(next);
    setFocus(next.timer.focusDuration);
    setRest(next.timer.breakDuration);
    setSessions(next.timer.totalSessions);
    if (brandingRevisionRef.current !== next.branding.updatedAt) {
      brandingRevisionRef.current = next.branding.updatedAt;
      setLogoPosition(next.branding.position);
      setLogoSize(next.branding.size);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.ok) applyState(await response.json() as AppState);
    } catch {
      // Keep the last server state during a short network interruption.
    }
  }, [applyState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("focus-party-language");
      const storedVisualTheme = window.localStorage.getItem("focus-party-visual-theme");
      const storedOverlaySound = window.localStorage.getItem("focus-party-overlay-sound");
      const browserLanguage = window.navigator.language.slice(0, 2);
      const nextLanguage = isLanguage(stored) ? stored : isLanguage(browserLanguage) ? browserLanguage : "fr";
      setLanguage(nextLanguage);
      setVisualTheme(storedVisualTheme === "colorblind" ? "colorblind" : "standard");
      setOverlaySound(storedOverlaySound !== "off");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem("focus-party-language", nextLanguage);
  };

  const changeVisualTheme = (nextTheme: VisualTheme) => {
    setVisualTheme(nextTheme);
    window.localStorage.setItem("focus-party-visual-theme", nextTheme);
  };

  const changeOverlaySound = (enabled: boolean) => {
    setOverlaySound(enabled);
    window.localStorage.setItem("focus-party-overlay-sound", enabled ? "on" : "off");
  };

  const testOverlaySound = async () => {
    const played = await playTimerChime("finished");
    notify(played ? copy.soundPlayed : copy.soundBlocked);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.visualTheme = visualTheme;
  }, [visualTheme]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("twitch");
    const notification = result === "connected"
      ? copy.authConnected
      : result === "warning"
        ? copy.authWarning
        : result === "error"
          ? copy.authError
          : "";
    const timer = notification ? window.setTimeout(() => notify(notification), 0) : null;
    if (result) window.history.replaceState({}, "", window.location.pathname);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [copy.authConnected, copy.authError, copy.authWarning, notify]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, FALLBACK_REFRESH_MS);
    const localChannel = new BroadcastChannel("focus-party-updates");
    localChannel.onmessage = () => void refresh();
    let stopped = false;
    let reconnectTimer: number | null = null;
    let realtime: WebSocket | null = null;

    const connectRealtime = () => {
      if (!state.channel.id) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      realtime = new WebSocket(
        `${protocol}//${window.location.host}/api/realtime?channel=${encodeURIComponent(state.channel.id)}`,
      );
      realtime.onmessage = () => void refresh();
      realtime.onclose = () => {
        if (!stopped) reconnectTimer = window.setTimeout(connectRealtime, REALTIME_RECONNECT_MS);
      };
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    connectRealtime();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearTimeout(initialRefresh);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      localChannel.close();
      realtime?.close();
    };
  }, [refresh, state.channel.id]);

  useEffect(() => {
    if (state.timer.status !== "RUNNING") return;
    const tick = window.setInterval(() => {
      setState((current) => ({
        ...current,
        timer: { ...current.timer, remainingSeconds: Math.max(0, current.timer.remainingSeconds - 1) },
      }));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [state.timer.status, state.timer.phase, state.timer.currentSession]);

  useEffect(() => {
    const previousRemainingSeconds = previousRemainingSecondsRef.current;
    previousRemainingSecondsRef.current = state.timer.remainingSeconds;
    if (state.timer.status !== "RUNNING" || state.timer.remainingSeconds !== 0 || previousRemainingSeconds <= 0) return;
    const boundaryRefresh = window.setTimeout(() => void refresh(), 300);
    return () => window.clearTimeout(boundaryRefresh);
  }, [refresh, state.timer.remainingSeconds, state.timer.status]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.recentChat]);

  useEffect(() => () => {
    if (logoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
  }, [logoPreviewUrl]);

  const taskScrollKey = state.tasks
    .map((task) => `${task.id}:${Number(Boolean(task.completed))}:${Number(Boolean(task.focused))}`)
    .join("|");

  useEffect(() => {
    const viewport = taskListRef.current;
    if (!viewport) return;

    viewport.scrollTop = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    let animationFrame = 0;
    let direction = 1;
    let previousTime = performance.now();
    let pausedUntil = previousTime + 2200;
    const speed = 8;

    const animate = (time: number) => {
      const maximumScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const elapsed = Math.min(64, time - previousTime);
      previousTime = time;

      if (!taskScrollPausedRef.current && maximumScroll > 1 && time >= pausedUntil) {
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
  }, [taskScrollKey]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { state?: AppState; reply?: string; error?: string };
      if (!response.ok || !result.state) throw new Error(result.error ?? copy.genericError);
      applyState(result.state);
      const localChannel = new BroadcastChannel("focus-party-updates");
      localChannel.postMessage("refresh");
      localChannel.close();
      return result.reply ?? copy.updateSaved;
    } finally {
      setBusy(false);
    }
  }, [applyState, copy.genericError, copy.updateSaved]);

  const controlTimer = async (action: string) => {
    try {
      await post({ action });
      notify(copy.updateSaved);
    } catch (error) {
      notify(error instanceof Error ? error.message : copy.genericError);
    }
  };

  const saveSettings = async () => {
    try {
      await post({
        action: "configure",
        focusDuration: focus,
        breakDuration: rest,
        totalSessions: sessions,
      });
      notify(copy.configSaved);
    } catch (error) {
      notify(error instanceof Error ? error.message : copy.genericError);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/twitch/disconnect", { method: "POST" });
      if (!response.ok) throw new Error(copy.disconnectFailed);
      applyState(fallbackState);
      window.location.assign("/");
    } catch (error) {
      notify(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const chooseLogo = (file: File | null) => {
    if (!file) return;
    if (file.type !== "image/png") {
      if (logoInputRef.current) logoInputRef.current.value = "";
      return notify(copy.pngOnly);
    }
    if (file.size > 512 * 1024) {
      if (logoInputRef.current) logoInputRef.current.value = "";
      return notify(copy.pngTooLarge);
    }
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const saveLogo = async () => {
    if (!state.channel.connected) return notify(copy.connectFirst);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("position", logoPosition);
      form.set("size", String(logoSize));
      if (logoFile) form.set("logo", logoFile);
      const response = await fetch("/api/branding", { method: "POST", body: form });
      const result = await response.json() as { branding?: AppState["branding"]; error?: string };
      if (!response.ok || !result.branding) throw new Error(result.error ?? copy.logoSaveFailed);
      setState((current) => ({ ...current, branding: result.branding! }));
      setLogoFile(null);
      setLogoPreviewUrl("");
      if (logoInputRef.current) logoInputRef.current.value = "";
      notify(copy.logoSaved);
    } catch (error) {
      notify(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/branding", { method: "DELETE" });
      const result = await response.json() as { branding?: AppState["branding"]; error?: string };
      if (!response.ok || !result.branding) throw new Error(result.error ?? copy.logoRemoveFailed);
      setState((current) => ({ ...current, branding: result.branding! }));
      setLogoFile(null);
      setLogoPreviewUrl("");
      if (logoInputRef.current) logoInputRef.current.value = "";
      notify(copy.logoRemoved);
    } catch (error) {
      notify(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  const totalSeconds = (state.timer.phase === "FOCUS" ? state.timer.focusDuration : state.timer.breakDuration) * 60;
  const progress = state.timer.status === "IDLE"
    ? 0
    : Math.min(100, Math.max(0, (1 - state.timer.remainingSeconds / totalSeconds) * 100));
  const completedCount = state.tasks.filter((task) => Boolean(task.completed)).length;
  const participantCount = new Set(state.tasks.map((task) => task.userId)).size;
  const taskGroups = groupTasksByParticipant(state.tasks);
  const overlayBaseUrl = typeof window === "undefined" || !state.channel.id
    ? ""
    : `${window.location.origin}/overlay?channel=${encodeURIComponent(state.channel.id)}`;
  const overlaySources: Array<{ mode: OverlayMode; title: string; description: string; size: string; url: string }> = [
    { mode: "timer", title: copy.timerOnly, description: copy.timerOnlyDescription, size: "900 × 300 px", url: overlayBaseUrl ? `${overlayBaseUrl}&display=timer&theme=${overlayTheme}&timerStyle=${timerLayout}&lang=${language}&sound=${overlaySound ? "on" : "off"}` : copy.connectForLink },
    { mode: "tasks", title: copy.tasksOnly, description: copy.tasksOnlyDescription, size: "350 × 700 px", url: overlayBaseUrl ? `${overlayBaseUrl}&display=tasks&theme=${overlayTheme}&lang=${language}` : copy.connectForLink },
    { mode: "combined", title: copy.combined, description: copy.combinedDescription, size: "900 × 600 px", url: overlayBaseUrl ? `${overlayBaseUrl}&display=combined&theme=${overlayTheme}&timerStyle=${timerLayout}&lang=${language}&sound=${overlaySound ? "on" : "off"}` : copy.connectForLink },
  ];
  const selectedOverlay = overlaySources.find((source) => source.mode === previewOverlay) ?? overlaySources[2];
  const savedLogoUrl = state.channel.id && state.branding.hasLogo
    ? `/api/logo?channel=${encodeURIComponent(state.channel.id)}&v=${encodeURIComponent(state.branding.updatedAt ?? "logo")}`
    : "";
  const displayedLogoUrl = logoPreviewUrl || savedLogoUrl;

  const copyOverlay = async (source: (typeof overlaySources)[number]) => {
    if (!state.channel.id) return notify(copy.connectFirst);
    await navigator.clipboard.writeText(source.url);
    setCopiedOverlay(source.mode);
    window.setTimeout(() => setCopiedOverlay(null), 1800);
  };

  const streamerName = state.channel.displayName || "streamer";
  const titleByView: Record<string, [string, string]> = {
    dashboard: [state.channel.connected ? copy.greeting.replace("{name}", streamerName) : copy.welcome, state.channel.connected ? copy.readySubtitle : copy.welcomeSubtitle],
    overlay: [copy.overlayPageTitle, copy.overlayPageSubtitle],
    commands: [copy.commandsPageTitle, copy.commandsPageSubtitle],
    settings: [copy.settingsPageTitle, copy.settingsPageSubtitle],
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("dashboard")} aria-label="Focus Party">
          <span className="brand-mark">✦</span>
          <span>FOCUS<span>PARTY</span></span>
        </button>
        <nav className="main-nav" aria-label="Navigation">
          {[["dashboard", copy.navDashboard], ["overlay", copy.navOverlay], ["commands", copy.navCommands], ["settings", copy.navSettings]].map(([key, label]) => (
            <button key={key} className={activeView === key ? "active" : ""} onClick={() => setActiveView(key)}>
              <Icon name={key} /> <span>{label}</span>{key === "overlay" && state.channel.connected && <em>{copy.live}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">⌘</span>
          <strong>{state.channel.chatConnected ? copy.chatReady : copy.twitchConnection}</strong>
          <p>{state.channel.chatConnected ? copy.commandsRealtime : copy.connectToActivate}</p>
        </div>
        <div className="profile-card">
          <span className="avatar">{streamerName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{streamerName}</strong><small>{state.channel.username ? `@${state.channel.username}` : copy.notConnected}</small></span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">{copy.streamArea}</p><h1>{titleByView[activeView][0]}</h1><p>{titleByView[activeView][1]}</p></div>
          <div className="top-actions">
            <label className="accessibility-picker" title={copy.colorblindThemeDescription}>
              <span aria-hidden="true">◐</span>
              <select aria-label={copy.accessibilityTheme} value={visualTheme} onChange={(event) => changeVisualTheme(event.target.value as VisualTheme)}>
                <option value="standard">{copy.standardTheme}</option>
                <option value="colorblind">{copy.colorblindTheme}</option>
              </select>
            </label>
            <div className="language-switcher" role="group" aria-label={copy.languagePicker}>
              {languageOptions.map((option) => <button key={option.id} className={language === option.id ? "active" : ""} onClick={() => changeLanguage(option.id)} aria-pressed={language === option.id} title={option.label}>{option.short}</button>)}
            </div>
            {state.channel.chatConnected && <div className="live-indicator"><i /> {copy.chatLive}</div>}
          </div>
        </header>

        {activeView === "dashboard" && (
          <>
            <section className={`twitch-strip ${state.channel.connected ? "" : "disconnected"}`}>
              <div className="twitch-logo">◖◗</div>
              {state.channel.connected ? (
                <>
                  <div><small>{copy.channelConnected}</small><strong>@{state.channel.username}</strong></div>
                  <span className={state.channel.chatConnected ? "connected" : "pending"}><i /> {state.channel.chatConnected ? copy.chatActive : copy.chatActivating}</span>
                  <p>{state.channel.chatConnected ? copy.realChatListening : copy.twitchChecking}</p>
                  <button onClick={disconnect} disabled={busy}>{copy.disconnect} <span>→</span></button>
                </>
              ) : (
                <>
                  <div><small>{copy.noChannelConnected}</small><strong>{copy.connectAccount}</strong></div>
                  <p>{copy.twitchRights}</p>
                  <a className="twitch-connect" href="/api/auth/twitch/start">{copy.connectTwitch} <span>→</span></a>
                </>
              )}
            </section>

            <div className="dashboard-grid">
              <section className="timer-card">
                <div className="card-heading inverted"><div><span className="section-icon"><Icon name="timer" /></span><div><small>{copy.currentPomodoro}</small><h2>{copy.focusSession}</h2></div></div><StatusPill timer={state.timer} copy={copy} /></div>
                <div className="timer-center"><span className="session-label">{copy.session} {state.timer.currentSession} <i>/</i> {state.timer.totalSessions}</span><strong className="big-time">{formatTime(state.timer.remainingSeconds)}</strong><span className="phase-label">{state.timer.status === "PAUSED" ? copy.pausedLong : state.timer.phase === "BREAK" ? copy.breathing : copy.focusTime}</span></div>
                <div className="progress-wrap"><div className="progress-meta"><span>{copy.progress}</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><p>{state.timer.phase === "FOCUS" ? `${copy.nextBreak} : ${state.timer.breakDuration} min` : `${copy.nextFocus} : ${state.timer.focusDuration} min`} <span>•</span> {copy.expectedEnd} {state.timer.totalSessions - state.timer.currentSession + 1} {state.timer.totalSessions - state.timer.currentSession + 1 > 1 ? copy.sessionsWord : copy.sessionWord}</p></div>
                <div className="timer-controls">
                  {state.timer.status === "RUNNING" ? <button className="primary-control" onClick={() => controlTimer("pause")} disabled={busy || !state.channel.connected}><span>Ⅱ</span> {copy.pauseTimer}</button> : state.timer.status === "PAUSED" ? <button className="primary-control" onClick={() => controlTimer("resume")} disabled={busy || !state.channel.connected}><span>▶</span> {copy.resumeTimer}</button> : <button className="primary-control" onClick={() => controlTimer("start")} disabled={busy || !state.channel.connected}><span>▶</span> {copy.startFocus}</button>}
                  <button className="icon-control" aria-label={copy.stopReset} onClick={() => controlTimer("stop")} disabled={busy || !state.channel.connected}>■</button>
                </div>
              </section>

              <section className="config-card">
                <div className="card-heading"><div><span className="section-icon pale"><Icon name="settings" /></span><div><small>{copy.yourRhythm}</small><h2>{copy.configuration}</h2></div></div><span className="saved-dot">{copy.serverSave}</span></div>
                <div className="duration-row"><label><span>{copy.focus}</span><strong><input aria-label={copy.focusDuration} type="number" min="1" max="120" value={focus} onChange={(event) => setFocus(Number(event.target.value))} /> min</strong></label><span className="duration-arrow">→</span><label><span>{copy.break}</span><strong><input aria-label={copy.breakDuration} type="number" min="1" max="60" value={rest} onChange={(event) => setRest(Number(event.target.value))} /> min</strong></label></div>
                <div className="session-control"><span>{copy.sessionsCount}</span><div><button onClick={() => setSessions(Math.max(1, sessions - 1))} aria-label={copy.removeSession}>−</button><strong>{sessions}</strong><button onClick={() => setSessions(Math.min(20, sessions + 1))} aria-label={copy.addSession}>＋</button></div></div>
                <div className="timeline" aria-label={copy.sessionsConfigured.replace("{count}", String(sessions))}>{Array.from({ length: Math.min(sessions, 8) }, (_, index) => <i key={index} className={index === 0 ? "active" : ""} />)}</div>
                <div className="config-summary"><span>{copy.estimatedDuration}</span><strong>{Math.floor((focus * sessions + rest * Math.max(0, sessions - 1)) / 60)}h {(focus * sessions + rest * Math.max(0, sessions - 1)) % 60}min</strong></div>
                <button className="save-button" onClick={saveSettings} disabled={busy || !state.channel.connected}>{copy.saveConfiguration} <span>→</span></button>
                <p className="chat-hint"><Icon name="chat" /> {copy.fromChat} : <code>!timer {focus}/{rest}</code></p>
              </section>
            </div>

            <div className="lower-grid">
              <section className="community-card">
                <div className="card-heading"><div><span className="section-icon mint"><Icon name="tasks" /></span><div><small>{copy.chatGoals}</small><h2>{copy.communityTasks}</h2></div></div><button onClick={() => setActiveView("commands")}>{copy.viewCommands} →</button></div>
                <div className="community-stats"><div><strong>{state.tasks.length}</strong><span>{copy.totalTasks}</span></div><div><strong>{completedCount}</strong><span>{copy.completedPlural}</span></div><div><strong>{participantCount}</strong><span>{copy.participants}</span></div></div>
                <div className="task-list-header" aria-label={copy.taskList}>
                  <code>!taskhelp</code>
                  <span><strong>{completedCount}</strong>/{state.tasks.length}</span>
                </div>
                <div className="task-list-frame">
                  <div
                    className="task-list"
                    ref={taskListRef}
                    aria-label={copy.groupedTasks}
                    onMouseEnter={() => { taskScrollPausedRef.current = true; }}
                    onMouseLeave={() => { taskScrollPausedRef.current = false; }}
                    onTouchStart={() => { taskScrollPausedRef.current = true; }}
                    onTouchEnd={() => { taskScrollPausedRef.current = false; }}
                  >
                    {taskGroups.length ? taskGroups.map((group) => (
                      <section className="task-person-group" key={group.userId}>
                        <header className="task-person-heading">
                          <strong>{group.username}</strong>
                        </header>
                        <ol className="task-person-items">
                          {group.tasks.map((task) => (
                            <li className={`task-row${task.completed ? " done" : ""}${task.focused ? " focused" : ""}`} aria-current={task.focused ? "true" : undefined} key={task.id}>
                              <span>{task.text}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )) : <p className="empty-state">{copy.emptyTasks}</p>}
                  </div>
                </div>
              </section>

              <section className="chat-card">
                <div className="card-heading chat-heading"><div><span className="section-icon violet"><Icon name="chat" /></span><div><small>{copy.realActivity}</small><h2>{copy.twitchCommands}</h2></div></div><span className="viewer-count"><i /> {copy.live}</span></div>
                <div className="chat-feed real-chat-feed">
                  {state.recentChat.length ? state.recentChat.slice(-6).map((entry) => <div className={`chat-command ${entry.role}`} key={entry.id}><div className="chat-line"><span className="chat-avatar">{entry.username.slice(0, 1).toUpperCase()}</span><p><strong>{entry.username}{entry.role === "streamer" && <em>{copy.streamer}</em>}</strong><span>{entry.message}</span></p></div>{entry.reply && <div className="chat-reply">↳ {entry.reply}</div>}</div>) : <p className="empty-state">{copy.emptyChat}</p>}
                  <div ref={chatEndRef} />
                </div>
              </section>
            </div>
            <section className="seo-intro" aria-labelledby="focus-party-seo-title">
              <div className="seo-intro-heading">
                <small>{copy.seoEyebrow}</small>
                <h2 id="focus-party-seo-title">{copy.seoTitle}</h2>
                <p>{copy.seoIntro}</p>
              </div>
              <div className="seo-feature-grid">
                {copy.seoFeatures.map((feature) => <article key={feature.title}><strong>{feature.title}</strong><p>{feature.description}</p></article>)}
              </div>
              <p className="seo-open-source">{copy.seoOpenSource}</p>
            </section>
          </>
        )}

        {activeView === "overlay" && (
          <section className="subpage overlay-page">
            <div className="subpage-intro"><span className="section-icon violet"><Icon name="overlay" /></span><div><small>{copy.browserSources}</small><h2>{copy.yourObsOverlays}</h2><p>{copy.overlayIntro}</p></div></div>
            <section className="overlay-theme-picker" aria-labelledby="overlay-theme-title">
              <div className="overlay-theme-heading"><span><small>{copy.overlayAppearance}</small><strong id="overlay-theme-title">{copy.chooseTheme}</strong></span><p>{copy.themeInLink}</p></div>
              <div className="overlay-theme-grid" role="group" aria-label={copy.availableThemes}>
                {overlayThemes.map((theme) => (
                  <button className={overlayTheme === theme.id ? "selected" : ""} key={theme.id} onClick={() => setOverlayTheme(theme.id)} aria-pressed={overlayTheme === theme.id}>
                    <span className="theme-swatches" aria-hidden="true">{theme.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
                    <strong>{copy.themeNames[theme.id]}</strong>
                    {overlayTheme === theme.id && <em>{copy.chosen}</em>}
                  </button>
                ))}
              </div>
            </section>
            <section className="timer-layout-picker" aria-labelledby="timer-layout-title">
              <div className="overlay-theme-heading"><span><small>{copy.timerModel}</small><strong id="timer-layout-title">{copy.chooseLayout}</strong></span><p>{copy.layoutApplies}</p></div>
              <div className="timer-layout-grid" role="group" aria-label={copy.availableLayouts}>
                {timerLayouts.map((layout) => (
                  <button className={timerLayout === layout ? "selected" : ""} key={layout} onClick={() => setTimerLayout(layout)} aria-pressed={timerLayout === layout}>
                    <span className={`timer-layout-mini mini-${layout}`} aria-hidden="true"><i /><b /><em /></span>
                    <span><strong>{copy.timerLayouts[layout].name}</strong><small>{copy.timerLayouts[layout].description}</small></span>
                    {timerLayout === layout && <em>{copy.chosen}</em>}
                  </button>
                ))}
              </div>
            </section>
            <section className="overlay-sound-picker" aria-labelledby="overlay-sound-title">
              <div className="overlay-theme-heading"><span><small>{copy.overlaySound}</small><strong id="overlay-sound-title">{copy.sessionBell}</strong></span><p>{copy.soundInLink}</p></div>
              <div className="overlay-sound-row">
                <label className="toggle-row" htmlFor="overlay-sound-enabled"><span><strong>{copy.playBell}</strong><small>{copy.bellDescription}</small></span><input id="overlay-sound-enabled" aria-label={copy.playBell} type="checkbox" checked={overlaySound} onChange={(event) => changeOverlaySound(event.target.checked)} /><i aria-hidden="true" /></label>
                <button type="button" className="sound-test-button" onClick={testOverlaySound}>♬ {copy.testSound}</button>
              </div>
            </section>
            <section className="overlay-logo-picker" aria-labelledby="overlay-logo-title">
              <div className="overlay-theme-heading"><span><small>{copy.logoOrImage}</small><strong id="overlay-logo-title">{copy.addPng}</strong></span><p>{copy.logoApplies}</p></div>
              <div className="overlay-logo-content">
                <div className={`overlay-logo-preview logo-${logoPosition}`} aria-label={copy.logoPositionPreview}>
                  <span>{copy.obsArea}</span>
                  {displayedLogoUrl ? <i role="img" aria-label={copy.selectedLogo} style={{ width: `${Math.max(34, logoSize * .58)}px`, height: `${Math.max(34, logoSize * .58)}px`, backgroundImage: `url(${displayedLogoUrl})` }} /> : <em>PNG</em>}
                </div>
                <div className="overlay-logo-controls">
                  <label className="logo-file-button">
                    <input ref={logoInputRef} type="file" accept="image/png,.png" onChange={(event) => chooseLogo(event.target.files?.[0] ?? null)} disabled={!state.channel.connected || busy} />
                    <span>{state.branding.hasLogo || logoFile ? copy.replacePng : copy.choosePng}</span>
                    <small>{copy.maxPng}</small>
                  </label>
                  <fieldset><legend>{copy.position}</legend><div className="logo-position-grid">{logoPositionOptions.map((position) => <button type="button" className={logoPosition === position ? "selected" : ""} key={position} onClick={() => setLogoPosition(position)} aria-pressed={logoPosition === position}>{copy.logoPositions[position]}</button>)}</div></fieldset>
                  <label className="logo-size-control"><span>{copy.size} <strong>{logoSize} px</strong></span><input type="range" min="40" max="180" step="4" value={logoSize} onChange={(event) => setLogoSize(Number(event.target.value))} /></label>
                  <div className="logo-actions"><button className="save-button" onClick={saveLogo} disabled={busy || !state.channel.connected || (!logoFile && !state.branding.hasLogo)}>{copy.saveLogo}</button>{state.branding.hasLogo && <button className="logo-remove-button" onClick={removeLogo} disabled={busy}>{copy.remove}</button>}</div>
                </div>
              </div>
            </section>
            <div className="overlay-source-grid">
              {overlaySources.map((source) => (
                <article className={`overlay-source-card ${previewOverlay === source.mode ? "selected" : ""}`} key={source.mode}>
                  <button className="overlay-source-select" onClick={() => setPreviewOverlay(source.mode)} aria-pressed={previewOverlay === source.mode}>
                    <span className={`overlay-source-icon ${source.mode}`}><Icon name={source.mode === "tasks" ? "tasks" : source.mode === "timer" ? "timer" : "overlay"} /></span>
                    <span><strong>{source.title}</strong><small>{source.description}</small></span>
                    <em>{source.size}</em>
                  </button>
                  <div className="url-box"><code>{source.url}</code><button onClick={() => copyOverlay(source)} disabled={!state.channel.id}><Icon name="copy" /> {copiedOverlay === source.mode ? copy.copied : copy.copy}</button></div>
                </article>
              ))}
            </div>
            {state.channel.id && <div className="overlay-preview-shell"><div className="preview-label"><span>{copy.preview} — {selectedOverlay.title.toUpperCase()} · {copy.themeNames[overlayTheme].toUpperCase()}{selectedOverlay.mode !== "tasks" ? ` · ${copy.timerLayouts[timerLayout].name.toUpperCase()}` : ""}</span><a href={selectedOverlay.url} target="_blank" rel="noreferrer">{copy.openNewTab} ↗</a></div><iframe className={`preview-${selectedOverlay.mode}`} key={`${selectedOverlay.mode}-${overlayTheme}-${timerLayout}-${language}-${overlaySound}`} title={`${copy.obsPreview} — ${selectedOverlay.title}`} src={`${selectedOverlay.url}&preview=1`} /></div>}
            <div className="obs-steps"><div><span>1</span><p><strong>{copy.chooseSource}</strong>{copy.chooseSourceText}</p></div><div><span>2</span><p><strong>{copy.copyUrl}</strong>{copy.copyUrlText}</p></div><div><span>3</span><p><strong>{copy.useSize}</strong>{copy.useSizeText}</p></div></div>
          </section>
        )}

        {activeView === "commands" && (
          <section className="subpage commands-page">
            <div className="subpage-intro"><span className="section-icon mint"><Icon name="commands" /></span><div><small>{copy.streamRemote}</small><h2>{copy.availableCommands}</h2><p>{copy.commandsIntro}</p></div></div>
            <div className="command-table"><div className="command-head"><span>{copy.command}</span><span>{copy.effect}</span><span>{copy.access}</span></div>{commandGroups.map((item, index) => <div className="command-row" key={item.command}><code>{item.command}</code><span>{copy.commandDescriptions[index]}</span><em>{item.access === "streamer" ? copy.accessStreamer : copy.accessEveryone}</em></div>)}</div>
            <div className="permission-note"><span>◈</span><p><strong>{copy.safePermissions}</strong>{copy.safePermissionsText}</p></div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="subpage settings-page">
            <div className="settings-grid">
              <div className="settings-panel"><small>{copy.timer}</small><h2>{copy.defaultRhythm}</h2><div className="settings-fields"><label>{copy.focus}<input aria-label={copy.defaultFocusDuration} type="number" value={focus} onChange={(event) => setFocus(Number(event.target.value))} /><span>{copy.minutes}</span></label><label>{copy.break}<input aria-label={copy.defaultBreakDuration} type="number" value={rest} onChange={(event) => setRest(Number(event.target.value))} /><span>{copy.minutes}</span></label><label>{copy.sessionsWord}<input aria-label={copy.defaultSessions} type="number" value={sessions} onChange={(event) => setSessions(Number(event.target.value))} /><span>{copy.cycles}</span></label></div><button className="save-button" onClick={saveSettings} disabled={!state.channel.connected}>{copy.save}</button></div>
              <div className="settings-panel"><small>TWITCH</small><h2>{copy.connectionStatus}</h2><div className="connection-summary"><span>{copy.account}</span><strong>{state.channel.connected ? `@${state.channel.username}` : copy.notConnected}</strong></div><div className="connection-summary"><span>{copy.chatCommands}</span><strong>{state.channel.chatConnected ? copy.active : copy.inactive}</strong></div>{state.channel.connected ? <button className="disconnect-button" onClick={disconnect} disabled={busy}>{copy.disconnect} Twitch</button> : <a className="save-button settings-connect" href="/api/auth/twitch/start">{copy.connectTwitch}</a>}</div>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
