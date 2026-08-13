"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
};

type OverlayMode = "timer" | "tasks" | "combined";

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
};

const commandGroups = [
  { command: "!pomo 5", description: "Définir le nombre de sessions", access: "Streamer" },
  { command: "!timer 25/5", description: "Régler les durées focus / pause", access: "Streamer" },
  { command: "!pomo start", description: "Démarrer la session", access: "Streamer" },
  { command: "!pomo pause", description: "Mettre le timer en pause", access: "Streamer" },
  { command: "!pomo status", description: "Afficher l’état actuel", access: "Tout le monde" },
  { command: "!task", description: "Afficher sa liste personnelle", access: "Tout le monde" },
  { command: "!task add …", description: "Ajouter une tâche personnelle", access: "Tout le monde" },
  { command: "!task done 1", description: "Terminer sa tâche n°1", access: "Tout le monde" },
  { command: "!task remove 1", description: "Supprimer sa tâche n°1", access: "Tout le monde" },
  { command: "!task clear", description: "Nettoyer ses tâches terminées", access: "Tout le monde" },
  { command: "!task clear all", description: "Nettoyer toutes les tâches terminées", access: "Streamer" },
];

const taskCommandHints = ["!task", "!task add …", "!task done 1", "!task remove 1", "!task clear"];

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

function StatusPill({ timer }: { timer: Timer }) {
  const label = timer.status === "IDLE"
    ? "PRÊT"
    : timer.status === "FINISHED"
      ? "TERMINÉ"
      : timer.status === "PAUSED"
        ? "PAUSE"
        : timer.phase;
  return <span className={`status-pill status-${label.toLowerCase()}`}><i />{label}</span>;
}

export default function Dashboard() {
  const [state, setState] = useState<AppState>(fallbackState);
  const [activeView, setActiveView] = useState("dashboard");
  const [focus, setFocus] = useState(25);
  const [rest, setRest] = useState(5);
  const [sessions, setSessions] = useState(5);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedOverlay, setCopiedOverlay] = useState<OverlayMode | null>(null);
  const [previewOverlay, setPreviewOverlay] = useState<OverlayMode>("combined");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);
  const taskScrollPausedRef = useRef(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const applyState = useCallback((next: AppState) => {
    setState(next);
    setFocus(next.timer.focusDuration);
    setRest(next.timer.breakDuration);
    setSessions(next.timer.totalSessions);
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
    const result = new URLSearchParams(window.location.search).get("twitch");
    const notification = result === "connected"
      ? "Ta chaîne Twitch est connectée. L’écoute du chat démarre."
      : result === "warning"
        ? "Twitch est connecté, mais l’écoute du chat doit être relancée."
        : result === "error"
          ? "La connexion Twitch n’a pas abouti. Réessaie."
          : "";
    const timer = notification ? window.setTimeout(() => notify(notification), 0) : null;
    if (result) window.history.replaceState({}, "", window.location.pathname);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [notify]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, 8000);
    const localChannel = new BroadcastChannel("focus-party-updates");
    localChannel.onmessage = () => void refresh();
    let realtime: WebSocket | null = null;
    if (state.channel.id) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      realtime = new WebSocket(
        `${protocol}//${window.location.host}/api/realtime?channel=${encodeURIComponent(state.channel.id)}`,
      );
      realtime.onmessage = () => void refresh();
    }
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(initialRefresh);
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.recentChat]);

  const taskScrollKey = state.tasks
    .map((task) => `${task.id}:${Number(Boolean(task.completed))}`)
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
      if (!response.ok || !result.state) throw new Error(result.error ?? "Impossible d’enregistrer la modification.");
      applyState(result.state);
      const localChannel = new BroadcastChannel("focus-party-updates");
      localChannel.postMessage("refresh");
      localChannel.close();
      return result.reply ?? "Mise à jour enregistrée.";
    } finally {
      setBusy(false);
    }
  }, [applyState]);

  const controlTimer = async (action: string) => {
    try {
      notify(await post({ action }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  };

  const saveSettings = async () => {
    try {
      notify(await post({
        action: "configure",
        focusDuration: focus,
        breakDuration: rest,
        totalSessions: sessions,
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/twitch/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("La déconnexion n’a pas abouti.");
      applyState(fallbackState);
      notify("La chaîne Twitch est déconnectée.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Une erreur est survenue.");
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
    { mode: "timer", title: "Timer uniquement", description: "Le Pomodoro sans la liste des tâches.", size: "900 × 300 px", url: overlayBaseUrl ? `${overlayBaseUrl}&display=timer` : "Connecte Twitch pour obtenir ce lien" },
    { mode: "tasks", title: "Task List uniquement", description: "Les tâches regroupées par participant.", size: "650 × 700 px", url: overlayBaseUrl ? `${overlayBaseUrl}&display=tasks` : "Connecte Twitch pour obtenir ce lien" },
    { mode: "combined", title: "Timer + Task List", description: "Le timer et les tâches dans une seule source.", size: "900 × 600 px", url: overlayBaseUrl ? `${overlayBaseUrl}&display=combined` : "Connecte Twitch pour obtenir ce lien" },
  ];
  const selectedOverlay = overlaySources.find((source) => source.mode === previewOverlay) ?? overlaySources[2];

  const copyOverlay = async (source: (typeof overlaySources)[number]) => {
    if (!state.channel.id) return notify("Connecte d’abord ta chaîne Twitch.");
    await navigator.clipboard.writeText(source.url);
    setCopiedOverlay(source.mode);
    window.setTimeout(() => setCopiedOverlay(null), 1800);
  };

  const streamerName = state.channel.displayName || "streamer";
  const titleByView: Record<string, [string, string]> = {
    dashboard: [state.channel.connected ? `Bonsoir, ${streamerName} 👋` : "Bienvenue sur Focus Party", state.channel.connected ? "Ta chaîne est prête pour une session de focus." : "Connecte ta chaîne pour transformer ton chat en télécommande."],
    overlay: ["Overlay OBS", "Une source navigateur transparente, toujours synchronisée."],
    commands: ["Commandes du chat", "Tout ce que ta communauté peut piloter sans quitter Twitch."],
    settings: ["Paramètres", "Règle ta session et les droits de modération."],
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("dashboard")} aria-label="Focus Party — accueil">
          <span className="brand-mark">✦</span>
          <span>FOCUS<span>PARTY</span></span>
        </button>
        <nav className="main-nav" aria-label="Navigation principale">
          {[["dashboard", "Dashboard"], ["overlay", "Overlay OBS"], ["commands", "Commandes"], ["settings", "Paramètres"]].map(([key, label]) => (
            <button key={key} className={activeView === key ? "active" : ""} onClick={() => setActiveView(key)}>
              <Icon name={key} /> <span>{label}</span>{key === "overlay" && state.channel.connected && <em>LIVE</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">⌘</span>
          <strong>{state.channel.chatConnected ? "Le chat est prêt" : "Connexion Twitch"}</strong>
          <p>{state.channel.chatConnected ? "Les commandes sont écoutées en temps réel." : "Connecte ta chaîne pour activer les commandes."}</p>
        </div>
        <div className="profile-card">
          <span className="avatar">{streamerName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{streamerName}</strong><small>{state.channel.username ? `@${state.channel.username}` : "Non connecté"}</small></span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">ESPACE STREAMER</p><h1>{titleByView[activeView][0]}</h1><p>{titleByView[activeView][1]}</p></div>
          <div className="top-actions">
            {state.channel.chatConnected && <div className="live-indicator"><i /> CHAT EN DIRECT</div>}
          </div>
        </header>

        {activeView === "dashboard" && (
          <>
            <section className={`twitch-strip ${state.channel.connected ? "" : "disconnected"}`}>
              <div className="twitch-logo">◖◗</div>
              {state.channel.connected ? (
                <>
                  <div><small>CHAÎNE CONNECTÉE</small><strong>@{state.channel.username}</strong></div>
                  <span className={state.channel.chatConnected ? "connected" : "pending"}><i /> {state.channel.chatConnected ? "Chat actif" : "Activation du chat…"}</span>
                  <p>{state.channel.chatConnected ? "Les commandes du vrai chat Twitch sont écoutées" : "Twitch vérifie actuellement l’adresse de réception"}</p>
                  <button onClick={disconnect} disabled={busy}>Déconnecter <span>→</span></button>
                </>
              ) : (
                <>
                  <div><small>AUCUNE CHAÎNE CONNECTÉE</small><strong>Connecte ton compte Twitch</strong></div>
                  <p>Focus Party demandera uniquement les droits nécessaires au chat.</p>
                  <a className="twitch-connect" href="/api/auth/twitch/start">Se connecter à Twitch <span>→</span></a>
                </>
              )}
            </section>

            <div className="dashboard-grid">
              <section className="timer-card">
                <div className="card-heading inverted"><div><span className="section-icon"><Icon name="timer" /></span><div><small>POMODORO EN COURS</small><h2>Session de focus</h2></div></div><StatusPill timer={state.timer} /></div>
                <div className="timer-center"><span className="session-label">SESSION {state.timer.currentSession} <i>/</i> {state.timer.totalSessions}</span><strong className="big-time">{formatTime(state.timer.remainingSeconds)}</strong><span className="phase-label">{state.timer.status === "PAUSED" ? "EN PAUSE" : state.timer.phase === "BREAK" ? "RESPIRATION" : "TEMPS DE FOCUS"}</span></div>
                <div className="progress-wrap"><div className="progress-meta"><span>Progression</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><p>{state.timer.phase === "FOCUS" ? `Prochaine pause : ${state.timer.breakDuration} min` : `Prochain focus : ${state.timer.focusDuration} min`} <span>•</span> Fin prévue après {state.timer.totalSessions - state.timer.currentSession + 1} session{state.timer.totalSessions - state.timer.currentSession + 1 > 1 ? "s" : ""}</p></div>
                <div className="timer-controls">
                  {state.timer.status === "RUNNING" ? <button className="primary-control" onClick={() => controlTimer("pause")} disabled={busy || !state.channel.connected}><span>Ⅱ</span> Mettre en pause</button> : state.timer.status === "PAUSED" ? <button className="primary-control" onClick={() => controlTimer("resume")} disabled={busy || !state.channel.connected}><span>▶</span> Reprendre</button> : <button className="primary-control" onClick={() => controlTimer("start")} disabled={busy || !state.channel.connected}><span>▶</span> Démarrer le focus</button>}
                  <button className="icon-control" aria-label="Arrêter et réinitialiser" onClick={() => controlTimer("stop")} disabled={busy || !state.channel.connected}>■</button>
                </div>
              </section>

              <section className="config-card">
                <div className="card-heading"><div><span className="section-icon pale"><Icon name="settings" /></span><div><small>VOTRE RYTHME</small><h2>Configuration</h2></div></div><span className="saved-dot">Sauvegarde serveur</span></div>
                <div className="duration-row"><label><span>Focus</span><strong><input aria-label="Durée du focus" type="number" min="1" max="120" value={focus} onChange={(event) => setFocus(Number(event.target.value))} /> min</strong></label><span className="duration-arrow">→</span><label><span>Pause</span><strong><input aria-label="Durée de la pause" type="number" min="1" max="60" value={rest} onChange={(event) => setRest(Number(event.target.value))} /> min</strong></label></div>
                <div className="session-control"><span>Nombre de sessions</span><div><button onClick={() => setSessions(Math.max(1, sessions - 1))} aria-label="Retirer une session">−</button><strong>{sessions}</strong><button onClick={() => setSessions(Math.min(20, sessions + 1))} aria-label="Ajouter une session">＋</button></div></div>
                <div className="timeline" aria-label={`${sessions} sessions configurées`}>{Array.from({ length: Math.min(sessions, 8) }, (_, index) => <i key={index} className={index === 0 ? "active" : ""} />)}</div>
                <div className="config-summary"><span>Durée totale estimée</span><strong>{Math.floor((focus * sessions + rest * Math.max(0, sessions - 1)) / 60)}h {(focus * sessions + rest * Math.max(0, sessions - 1)) % 60}min</strong></div>
                <button className="save-button" onClick={saveSettings} disabled={busy || !state.channel.connected}>Enregistrer la configuration <span>→</span></button>
                <p className="chat-hint"><Icon name="chat" /> Depuis ton chat : <code>!timer {focus}/{rest}</code></p>
              </section>
            </div>

            <div className="lower-grid">
              <section className="community-card">
                <div className="card-heading"><div><span className="section-icon mint"><Icon name="tasks" /></span><div><small>OBJECTIFS DU CHAT</small><h2>Tâches de la communauté</h2></div></div><button onClick={() => setActiveView("commands")}>Voir les commandes →</button></div>
                <div className="community-stats"><div><strong>{state.tasks.length}</strong><span>Tâches au total</span></div><div><strong>{completedCount}</strong><span>Terminées</span></div><div><strong>{participantCount}</strong><span>Participants</span></div></div>
                <div className="task-list-header">
                  <strong>TASK LIST</strong>
                  <div className="task-command-hints" aria-label="Rappel des commandes de tâches">
                    {taskCommandHints.map((command) => <code key={command}>{command}</code>)}
                  </div>
                </div>
                <div className="task-list-frame">
                  <div
                    className="task-list"
                    ref={taskListRef}
                    aria-label="Tâches regroupées par participant"
                    onMouseEnter={() => { taskScrollPausedRef.current = true; }}
                    onMouseLeave={() => { taskScrollPausedRef.current = false; }}
                    onTouchStart={() => { taskScrollPausedRef.current = true; }}
                    onTouchEnd={() => { taskScrollPausedRef.current = false; }}
                  >
                    {taskGroups.length ? taskGroups.map((group) => (
                      <section className="task-person-group" key={group.userId}>
                        <header className="task-person-heading">
                          <span>{group.username.slice(0, 1).toUpperCase()}</span>
                          <strong>{group.username}</strong>
                          <small>{group.tasks.length} tâche{group.tasks.length > 1 ? "s" : ""}</small>
                        </header>
                        {group.tasks.map((task, index) => (
                          <div className={`task-row ${task.completed ? "done" : ""}`} key={task.id}>
                            <span className="task-check">{task.completed ? "✓" : ""}</span>
                            <span className="task-copy"><small>{index + 1}</small><strong>{task.text}</strong></span>
                            <em>{task.completed ? "TERMINÉE" : "EN COURS"}</em>
                          </div>
                        ))}
                      </section>
                    )) : <p className="empty-state">Les tâches ajoutées depuis le chat Twitch apparaîtront ici.</p>}
                  </div>
                </div>
              </section>

              <section className="chat-card">
                <div className="card-heading chat-heading"><div><span className="section-icon violet"><Icon name="chat" /></span><div><small>ACTIVITÉ RÉELLE</small><h2>Commandes Twitch</h2></div></div><span className="viewer-count"><i /> EN DIRECT</span></div>
                <div className="chat-feed real-chat-feed">
                  {state.recentChat.length ? state.recentChat.slice(-6).map((entry) => <div className={`chat-command ${entry.role}`} key={entry.id}><div className="chat-line"><span className="chat-avatar">{entry.username.slice(0, 1).toUpperCase()}</span><p><strong>{entry.username}{entry.role === "streamer" && <em>STREAMER</em>}</strong><span>{entry.message}</span></p></div>{entry.reply && <div className="chat-reply">↳ {entry.reply}</div>}</div>) : <p className="empty-state">Les commandes envoyées dans ton véritable chat Twitch apparaîtront ici.</p>}
                  <div ref={chatEndRef} />
                </div>
              </section>
            </div>
          </>
        )}

        {activeView === "overlay" && (
          <section className="subpage overlay-page">
            <div className="subpage-intro"><span className="section-icon violet"><Icon name="overlay" /></span><div><small>3 SOURCES NAVIGATEUR</small><h2>Tes overlays OBS</h2><p>Choisis le timer, la Task List, ou les deux. Chaque source reste transparente et synchronisée avec le chat.</p></div></div>
            <div className="overlay-source-grid">
              {overlaySources.map((source) => (
                <article className={`overlay-source-card ${previewOverlay === source.mode ? "selected" : ""}`} key={source.mode}>
                  <button className="overlay-source-select" onClick={() => setPreviewOverlay(source.mode)} aria-pressed={previewOverlay === source.mode}>
                    <span className={`overlay-source-icon ${source.mode}`}><Icon name={source.mode === "tasks" ? "tasks" : source.mode === "timer" ? "timer" : "overlay"} /></span>
                    <span><strong>{source.title}</strong><small>{source.description}</small></span>
                    <em>{source.size}</em>
                  </button>
                  <div className="url-box"><code>{source.url}</code><button onClick={() => copyOverlay(source)} disabled={!state.channel.id}><Icon name="copy" /> {copiedOverlay === source.mode ? "Copiée !" : "Copier"}</button></div>
                </article>
              ))}
            </div>
            {state.channel.id && <div className="overlay-preview-shell"><div className="preview-label"><span>APERÇU — {selectedOverlay.title.toUpperCase()}</span><a href={selectedOverlay.url} target="_blank" rel="noreferrer">Ouvrir dans un nouvel onglet ↗</a></div><iframe className={`preview-${selectedOverlay.mode}`} key={selectedOverlay.mode} title={`Aperçu OBS — ${selectedOverlay.title}`} src={selectedOverlay.url} /></div>}
            <div className="obs-steps"><div><span>1</span><p><strong>Choisis ta source</strong>Timer, Task List ou les deux.</p></div><div><span>2</span><p><strong>Copie son URL</strong>Ajoute une source « Navigateur » dans OBS.</p></div><div><span>3</span><p><strong>Utilise la taille indiquée</strong>Tu peux ensuite la placer librement dans ta scène.</p></div></div>
          </section>
        )}

        {activeView === "commands" && (
          <section className="subpage commands-page">
            <div className="subpage-intro"><span className="section-icon mint"><Icon name="commands" /></span><div><small>TÉLÉCOMMANDE DU STREAM</small><h2>Commandes disponibles</h2><p>Écris ces commandes directement dans le chat de ta chaîne Twitch.</p></div></div>
            <div className="command-table"><div className="command-head"><span>Commande</span><span>Effet</span><span>Accès</span></div>{commandGroups.map((item) => <div className="command-row" key={item.command}><code>{item.command}</code><span>{item.description}</span><em>{item.access}</em></div>)}</div>
            <div className="permission-note"><span>◈</span><p><strong>Permissions sûres par défaut</strong>Les viewers gèrent uniquement leurs propres tâches. Seul le streamer peut modifier ou arrêter le Pomodoro.</p></div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="subpage settings-page">
            <div className="settings-grid">
              <div className="settings-panel"><small>MINUTEUR</small><h2>Rythme par défaut</h2><div className="settings-fields"><label>Focus<input aria-label="Durée de focus par défaut" type="number" value={focus} onChange={(event) => setFocus(Number(event.target.value))} /><span>minutes</span></label><label>Pause<input aria-label="Durée de pause par défaut" type="number" value={rest} onChange={(event) => setRest(Number(event.target.value))} /><span>minutes</span></label><label>Sessions<input aria-label="Nombre de sessions par défaut" type="number" value={sessions} onChange={(event) => setSessions(Number(event.target.value))} /><span>cycles</span></label></div><button className="save-button" onClick={saveSettings} disabled={!state.channel.connected}>Enregistrer</button></div>
              <div className="settings-panel"><small>TWITCH</small><h2>État de la connexion</h2><div className="connection-summary"><span>Compte</span><strong>{state.channel.connected ? `@${state.channel.username}` : "Non connecté"}</strong></div><div className="connection-summary"><span>Commandes du chat</span><strong>{state.channel.chatConnected ? "Actives" : "Inactives"}</strong></div>{state.channel.connected ? <button className="disconnect-button" onClick={disconnect} disabled={busy}>Déconnecter Twitch</button> : <a className="save-button settings-connect" href="/api/auth/twitch/start">Se connecter à Twitch</a>}</div>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
