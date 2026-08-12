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

type AppState = {
  channel: { id: string; username: string; displayName: string; connected: boolean };
  timer: Timer;
  tasks: Task[];
};

type ChatLine = {
  id: number;
  username: string;
  message: string;
  tone: "viewer" | "streamer" | "bot";
};

const fallbackState: AppState = {
  channel: { id: "demo-channel", username: "noctua_dev", displayName: "Noctua", connected: true },
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
};

const initialChat: ChatLine[] = [
  { id: 1, username: "lina_codes", message: "!task add Écrire les tests du composant Timer", tone: "viewer" },
  { id: 2, username: "FocusParty", message: "Tâche ajoutée : Écrire les tests du composant Timer", tone: "bot" },
  { id: 3, username: "milo_builds", message: "On est chauds pour la prochaine session 🔥", tone: "viewer" },
];

const commandGroups = [
  { command: "!pomo 5", description: "Définir le nombre de sessions", access: "Streamer" },
  { command: "!timer 25/5", description: "Régler les durées focus / pause", access: "Streamer" },
  { command: "!pomo start", description: "Démarrer la session", access: "Streamer" },
  { command: "!pomo pause", description: "Mettre le timer en pause", access: "Streamer" },
  { command: "!pomo status", description: "Afficher l’état actuel", access: "Tout le monde" },
  { command: "!task add …", description: "Ajouter une tâche personnelle", access: "Tout le monde" },
  { command: "!task done 1", description: "Terminer sa tâche n°1", access: "Tout le monde" },
  { command: "!task clear", description: "Nettoyer ses tâches terminées", access: "Tout le monde" },
];

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
  const isPaused = timer.status === "PAUSED";
  const label = timer.status === "IDLE" ? "PRÊT" : timer.status === "FINISHED" ? "TERMINÉ" : isPaused ? "PAUSE" : timer.phase;
  return <span className={`status-pill status-${label.toLowerCase()}`}><i />{label}</span>;
}

export default function Dashboard() {
  const [state, setState] = useState<AppState>(fallbackState);
  const [activeView, setActiveView] = useState("dashboard");
  const [focus, setFocus] = useState(25);
  const [rest, setRest] = useState(5);
  const [sessions, setSessions] = useState(5);
  const [chatLines, setChatLines] = useState<ChatLine[]>(initialChat);
  const [chatInput, setChatInput] = useState("!task add Préparer la démo Twitch");
  const [chatAs, setChatAs] = useState<"viewer" | "streamer">("viewer");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<WebSocket | null>(null);

  const applyState = useCallback((next: AppState) => {
    setState(next);
    setFocus(next.timer.focusDuration);
    setRest(next.timer.breakDuration);
    setSessions(next.timer.totalSessions);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) return;
      applyState(await response.json() as AppState);
    } catch {
      // The polished fallback keeps the local preview usable while the database wakes up.
    }
  }, [applyState]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, 8000);
    const channel = new BroadcastChannel("focus-party-updates");
    channel.onmessage = () => void refresh();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const realtime = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
    realtime.onmessage = () => void refresh();
    realtimeRef.current = realtime;
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(initialRefresh);
      channel.close();
      realtime.close();
      realtimeRef.current = null;
    };
  }, [refresh]);

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
  }, [chatLines]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

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
      if (realtimeRef.current?.readyState === WebSocket.OPEN) realtimeRef.current.send("refresh");
      return result.reply ?? "Mise à jour enregistrée.";
    } finally {
      setBusy(false);
    }
  }, [applyState]);

  const controlTimer = async (action: string) => {
    try {
      const reply = await post({ action, channelId: state.channel.id });
      notify(reply);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  };

  const saveSettings = async () => {
    try {
      const reply = await post({ action: "configure", channelId: state.channel.id, focusDuration: focus, breakDuration: rest, totalSessions: sessions });
      notify(reply);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  };

  const sendCommand = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    const actor = chatAs === "streamer"
      ? { id: "streamer", username: "noctua_dev", role: "streamer" }
      : { id: "viewer-lina", username: "lina_codes", role: "viewer" };
    setChatLines((lines) => [...lines, { id: Date.now(), username: actor.username, message, tone: chatAs }]);
    setChatInput("");
    try {
      const reply = await post({ action: "command", channelId: state.channel.id, actor, message });
      setChatLines((lines) => [...lines, { id: Date.now() + 1, username: "FocusParty", message: reply, tone: "bot" }]);
    } catch (error) {
      setChatLines((lines) => [...lines, { id: Date.now() + 1, username: "FocusParty", message: error instanceof Error ? error.message : "Commande refusée.", tone: "bot" }]);
    }
  };

  const totalSeconds = (state.timer.phase === "FOCUS" ? state.timer.focusDuration : state.timer.breakDuration) * 60;
  const progress = state.timer.status === "IDLE" ? 0 : Math.min(100, Math.max(0, (1 - state.timer.remainingSeconds / totalSeconds) * 100));
  const completedCount = state.tasks.filter((task) => Boolean(task.completed)).length;
  const participantCount = new Set(state.tasks.map((task) => task.userId)).size;
  const overlayUrl = typeof window === "undefined" ? "/overlay" : `${window.location.origin}/overlay?channel=${state.channel.id}`;

  const copyOverlay = async () => {
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const titleByView: Record<string, [string, string]> = {
    dashboard: ["Bonsoir, Noctua 👋", "Prêt à transformer le chat en salle de focus ?"],
    overlay: ["Overlay OBS", "Une source navigateur transparente, toujours synchronisée."],
    commands: ["Commandes du chat", "Tout ce que votre communauté peut piloter sans quitter Twitch."],
    settings: ["Paramètres", "Réglez votre session et les droits de modération."],
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("dashboard")} aria-label="Focus Party — accueil">
          <span className="brand-mark">✦</span>
          <span>FOCUS<span>PARTY</span></span>
        </button>
        <nav className="main-nav" aria-label="Navigation principale">
          {[
            ["dashboard", "Dashboard"],
            ["overlay", "Overlay OBS"],
            ["commands", "Commandes"],
            ["settings", "Paramètres"],
          ].map(([key, label]) => (
            <button key={key} className={activeView === key ? "active" : ""} onClick={() => setActiveView(key)}>
              <Icon name={key} /> <span>{label}</span>{key === "overlay" && <em>LIVE</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">⌘</span>
          <strong>Le chat est prêt</strong>
          <p>Les commandes sont écoutées en temps réel.</p>
        </div>
        <div className="profile-card">
          <span className="avatar">N</span>
          <span><strong>Noctua</strong><small>@{state.channel.username}</small></span>
          <button aria-label="Menu du profil">•••</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">ESPACE STREAMER</p>
            <h1>{titleByView[activeView][0]}</h1>
            <p>{titleByView[activeView][1]}</p>
          </div>
          <div className="top-actions">
            <div className="live-indicator"><i /> SESSION LIVE</div>
            <button className="notification" aria-label="Notifications">♢<span>2</span></button>
          </div>
        </header>

        {activeView === "dashboard" && (
          <>
            <section className="twitch-strip">
              <div className="twitch-logo">◖◗</div>
              <div><small>CHAÎNE CONNECTÉE</small><strong>{state.channel.username}</strong></div>
              <span className="connected"><i /> Connecté</span>
              <p>Les messages du chat sont écoutés</p>
              <button onClick={() => notify("Le mode démo reste connecté pour tester l’application.")}>Gérer la connexion <span>→</span></button>
            </section>

            <div className="dashboard-grid">
              <section className="timer-card">
                <div className="card-heading inverted">
                  <div><span className="section-icon"><Icon name="timer" /></span><div><small>POMODORO EN COURS</small><h2>Session de focus</h2></div></div>
                  <StatusPill timer={state.timer} />
                </div>
                <div className="timer-center">
                  <span className="session-label">SESSION {state.timer.currentSession} <i>/</i> {state.timer.totalSessions}</span>
                  <strong className="big-time">{formatTime(state.timer.remainingSeconds)}</strong>
                  <span className="phase-label">{state.timer.status === "PAUSED" ? "EN PAUSE" : state.timer.phase === "BREAK" ? "RESPIRATION" : "TEMPS DE FOCUS"}</span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-meta"><span>Progression</span><strong>{Math.round(progress)}%</strong></div>
                  <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
                  <p>{state.timer.phase === "FOCUS" ? `Prochaine pause : ${state.timer.breakDuration} min` : `Prochain focus : ${state.timer.focusDuration} min`} <span>•</span> Fin prévue après {state.timer.totalSessions - state.timer.currentSession + 1} session{state.timer.totalSessions - state.timer.currentSession + 1 > 1 ? "s" : ""}</p>
                </div>
                <div className="timer-controls">
                  {state.timer.status === "RUNNING" ? (
                    <button className="primary-control" onClick={() => controlTimer("pause")} disabled={busy}><span>Ⅱ</span> Mettre en pause</button>
                  ) : state.timer.status === "PAUSED" ? (
                    <button className="primary-control" onClick={() => controlTimer("resume")} disabled={busy}><span>▶</span> Reprendre</button>
                  ) : (
                    <button className="primary-control" onClick={() => controlTimer("start")} disabled={busy}><span>▶</span> Démarrer le focus</button>
                  )}
                  <button className="icon-control" aria-label="Arrêter et réinitialiser" onClick={() => controlTimer("stop")} disabled={busy}>■</button>
                </div>
              </section>

              <section className="config-card">
                <div className="card-heading">
                  <div><span className="section-icon pale"><Icon name="settings" /></span><div><small>VOTRE RYTHME</small><h2>Configuration</h2></div></div>
                  <span className="saved-dot">Sauvegarde auto</span>
                </div>
                <div className="duration-row">
                  <label><span>Focus</span><strong><input aria-label="Durée du focus" type="number" min="1" max="120" value={focus} onChange={(e) => setFocus(Number(e.target.value))} /> min</strong></label>
                  <span className="duration-arrow">→</span>
                  <label><span>Pause</span><strong><input aria-label="Durée de la pause" type="number" min="1" max="60" value={rest} onChange={(e) => setRest(Number(e.target.value))} /> min</strong></label>
                </div>
                <div className="session-control">
                  <span>Nombre de sessions</span>
                  <div><button onClick={() => setSessions(Math.max(1, sessions - 1))} aria-label="Retirer une session">−</button><strong>{sessions}</strong><button onClick={() => setSessions(Math.min(20, sessions + 1))} aria-label="Ajouter une session">＋</button></div>
                </div>
                <div className="timeline" aria-label={`${sessions} sessions configurées`}>
                  {Array.from({ length: Math.min(sessions, 8) }, (_, index) => <i key={index} className={index === 0 ? "active" : ""} />)}
                </div>
                <div className="config-summary"><span>Durée totale estimée</span><strong>{Math.floor((focus * sessions + rest * Math.max(0, sessions - 1)) / 60)}h {(focus * sessions + rest * Math.max(0, sessions - 1)) % 60}min</strong></div>
                <button className="save-button" onClick={saveSettings} disabled={busy}>Enregistrer la configuration <span>→</span></button>
                <p className="chat-hint"><Icon name="chat" /> Depuis le chat : <code>!timer {focus}/{rest}</code></p>
              </section>
            </div>

            <div className="lower-grid">
              <section className="community-card">
                <div className="card-heading">
                  <div><span className="section-icon mint"><Icon name="tasks" /></span><div><small>OBJECTIFS DU CHAT</small><h2>Tâches de la communauté</h2></div></div>
                  <button onClick={() => setActiveView("commands")}>Voir les commandes →</button>
                </div>
                <div className="community-stats">
                  <div><strong>{state.tasks.length}</strong><span>Tâches au total</span></div>
                  <div><strong>{completedCount}</strong><span>Terminées</span></div>
                  <div><strong>{participantCount || 1}</strong><span>Participants</span></div>
                </div>
                <div className="task-list">
                  {state.tasks.slice(0, 4).map((task) => (
                    <div className={`task-row ${task.completed ? "done" : ""}`} key={task.id}>
                      <span className="task-check">{task.completed ? "✓" : ""}</span>
                      <span><strong>{task.text}</strong><small>@{task.username}</small></span>
                      <em>{task.completed ? "TERMINÉE" : "EN COURS"}</em>
                    </div>
                  ))}
                </div>
              </section>

              <section className="chat-card">
                <div className="card-heading chat-heading">
                  <div><span className="section-icon violet"><Icon name="chat" /></span><div><small>SIMULATEUR</small><h2>Chat Twitch</h2></div></div>
                  <span className="viewer-count"><i /> 184</span>
                </div>
                <div className="chat-feed">
                  {chatLines.slice(-6).map((line) => (
                    <div className={`chat-line ${line.tone}`} key={line.id}>
                      <span className="chat-avatar">{line.username.slice(0, 1).toUpperCase()}</span>
                      <p><strong>{line.username}{line.tone === "streamer" && <em>STREAMER</em>}</strong><span>{line.message}</span></p>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form className="chat-form" onSubmit={sendCommand}>
                  <select aria-label="Rôle simulé" value={chatAs} onChange={(e) => setChatAs(e.target.value as "viewer" | "streamer")}>
                    <option value="viewer">Viewer</option><option value="streamer">Streamer</option>
                  </select>
                  <input aria-label="Commande de chat" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Essayez !task add…" maxLength={140} />
                  <button type="submit" disabled={busy} aria-label="Envoyer la commande">↑</button>
                </form>
              </section>
            </div>
          </>
        )}

        {activeView === "overlay" && (
          <section className="subpage overlay-page">
            <div className="subpage-intro"><span className="section-icon violet"><Icon name="overlay" /></span><div><small>SOURCE NAVIGATEUR</small><h2>Votre overlay est prêt</h2><p>Ajoutez cette URL dans OBS. Le fond est transparent et le timer reste synchronisé avec le serveur.</p></div></div>
            <div className="url-box"><code>{overlayUrl}</code><button onClick={copyOverlay}><Icon name="copy" /> {copied ? "Copiée !" : "Copier l’URL"}</button></div>
            <div className="overlay-preview-shell">
              <div className="preview-label"><span>APERÇU 16:9</span><a href="/overlay" target="_blank" rel="noreferrer">Ouvrir dans un nouvel onglet ↗</a></div>
              <iframe title="Aperçu de l’overlay OBS" src="/overlay" />
            </div>
            <div className="obs-steps"><div><span>1</span><p><strong>Ajoutez une source</strong>Choisissez « Navigateur » dans OBS.</p></div><div><span>2</span><p><strong>Collez l’URL</strong>Utilisez 900 × 500 px au minimum.</p></div><div><span>3</span><p><strong>Lancez le focus</strong>L’overlay suivra le timer en direct.</p></div></div>
          </section>
        )}

        {activeView === "commands" && (
          <section className="subpage commands-page">
            <div className="subpage-intro"><span className="section-icon mint"><Icon name="commands" /></span><div><small>TÉLÉCOMMANDE DU STREAM</small><h2>Commandes disponibles</h2><p>Copiez une commande ou essayez-la dans le simulateur du dashboard.</p></div></div>
            <div className="command-table">
              <div className="command-head"><span>Commande</span><span>Effet</span><span>Accès</span></div>
              {commandGroups.map((item) => <div className="command-row" key={item.command}><code>{item.command}</code><span>{item.description}</span><em>{item.access}</em></div>)}
            </div>
            <div className="permission-note"><span>◈</span><p><strong>Permissions sûres par défaut</strong>Les viewers gèrent uniquement leurs propres tâches. Seul le streamer peut modifier ou arrêter le Pomodoro.</p></div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="subpage settings-page">
            <div className="settings-grid">
              <div className="settings-panel"><small>MINUTEUR</small><h2>Rythme par défaut</h2><div className="settings-fields"><label>Focus<input aria-label="Durée de focus par défaut" type="number" value={focus} onChange={(e) => setFocus(Number(e.target.value))} /><span>minutes</span></label><label>Pause<input aria-label="Durée de pause par défaut" type="number" value={rest} onChange={(e) => setRest(Number(e.target.value))} /><span>minutes</span></label><label>Sessions<input aria-label="Nombre de sessions par défaut" type="number" value={sessions} onChange={(e) => setSessions(Number(e.target.value))} /><span>cycles</span></label></div><button className="save-button" onClick={saveSettings}>Enregistrer</button></div>
              <div className="settings-panel"><small>MODÉRATION</small><h2>Droits du chat</h2><label className="toggle-row"><span><strong>Les modérateurs peuvent démarrer</strong><small>Autorise !pomo start</small></span><input aria-label="Autoriser les modérateurs à démarrer" type="checkbox" /><i /></label><label className="toggle-row"><span><strong>Les modérateurs peuvent mettre en pause</strong><small>Autorise pause et reprise</small></span><input aria-label="Autoriser les modérateurs à mettre en pause" type="checkbox" /><i /></label><label className="toggle-row"><span><strong>Afficher les tâches dans l’overlay</strong><small>Montre les objectifs récents</small></span><input aria-label="Afficher les tâches dans l’overlay" type="checkbox" defaultChecked /><i /></label></div>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
