"use client";

import { useEffect, useState } from "react";
import { isLanguage, languageOptions, type Language } from "@/app/i18n";

type VisualTheme = "standard" | "colorblind";

const copy = {
  fr: {
    navProduct: "Le produit",
    navFeatures: "Fonctionnalités",
    navHow: "Comment ça marche",
    language: "Choisir la langue",
    accessibility: "Affichage",
    standard: "Standard",
    colorblind: "Daltonisme",
    eyebrow: "POMODORO × TWITCH × OBS",
    titleStart: "Le focus devient",
    titleAccent: "un moment collectif.",
    intro: "Focus Party transforme votre chat Twitch en partenaire de concentration : un timer Pomodoro, une Task List communautaire et des overlays OBS réunis dans un dashboard gratuit.",
    connect: "Se connecter à Twitch",
    dashboard: "Ouvrir mon dashboard",
    discover: "Découvrir le produit",
    permission: "Connexion sécurisée · Permissions Twitch limitées au nécessaire",
    free: "100 % gratuit",
    openSource: "Open source",
    obsReady: "Prêt pour OBS",
    posterAlt: "Aperçu du timer Focus Party et de ses commandes Twitch",
    liveLabel: "APERÇU EN DIRECT",
    session: "SESSION 1 / 5",
    focus: "FOCUS",
    tasks: "TASK LIST",
    featureEyebrow: "TOUT AU MÊME ENDROIT",
    featureTitle: "Conçu pour votre stream, pas pour vous distraire.",
    featureIntro: "Une interface sobre qui garde le timer, le chat et les objectifs de votre communauté parfaitement synchronisés.",
    features: [
      ["Timer Pomodoro", "Lancez, mettez en pause et configurez vos sessions depuis le dashboard ou le chat."],
      ["Task List communautaire", "Chaque participant retrouve ses propres tâches, regroupées sous son nom et faciles à suivre."],
      ["Overlays OBS", "Choisissez le timer, la Task List ou les deux, avec plusieurs thèmes sobres et accessibles."],
      ["Piloté par le chat", "Les commandes Twitch deviennent une télécommande simple pour le streamer et sa communauté."],
    ],
    productEyebrow: "LE PRODUIT EN IMAGES",
    productTitle: "Un dashboard clair. Des overlays qui s’intègrent partout.",
    timerPreview: "Aperçu du timer Pomodoro Focus Party",
    taskPreview: "Aperçu de la Task List communautaire Focus Party",
    overlayPreview: "Aperçu des sources navigateur pour OBS",
    timerCaption: "Le timer reste lisible en un coup d’œil.",
    taskCaption: "Les tâches sont séparées par participant.",
    overlayCaption: "Trois sources navigateur prêtes pour OBS.",
    howEyebrow: "PRÊT EN QUELQUES INSTANTS",
    howTitle: "Connectez. Configurez. Lancez le focus.",
    steps: [
      ["01", "Connectez Twitch", "Autorisez Focus Party à écouter les commandes utiles de votre chaîne."],
      ["02", "Réglez votre session", "Choisissez la durée du focus, des pauses et le nombre de cycles."],
      ["03", "Ajoutez votre overlay", "Copiez la source navigateur dans OBS et commencez votre Focus Party."],
    ],
    finalEyebrow: "VOTRE PROCHAINE SESSION COMMENCE ICI",
    finalTitle: "Prêt à faire participer votre communauté ?",
    finalText: "Aucun téléchargement. Aucun abonnement. Connectez Twitch et ouvrez votre dashboard.",
    github: "Voir le projet sur GitHub",
    madeFor: "Pomodoro communautaire gratuit pour Twitch.",
    authError: "La connexion à Twitch n’a pas abouti. Vous pouvez réessayer.",
  },
  en: {
    navProduct: "Product",
    navFeatures: "Features",
    navHow: "How it works",
    language: "Choose language",
    accessibility: "Display",
    standard: "Standard",
    colorblind: "Color-safe",
    eyebrow: "POMODORO × TWITCH × OBS",
    titleStart: "Focus becomes",
    titleAccent: "a shared experience.",
    intro: "Focus Party turns your Twitch chat into a focus partner: a Pomodoro timer, a community Task List and OBS overlays in one free dashboard.",
    connect: "Connect with Twitch",
    dashboard: "Open my dashboard",
    discover: "Explore the product",
    permission: "Secure sign-in · Twitch permissions limited to what is needed",
    free: "100% free",
    openSource: "Open source",
    obsReady: "OBS ready",
    posterAlt: "Preview of the Focus Party timer and its Twitch commands",
    liveLabel: "LIVE PREVIEW",
    session: "SESSION 1 / 5",
    focus: "FOCUS",
    tasks: "TASK LIST",
    featureEyebrow: "EVERYTHING IN ONE PLACE",
    featureTitle: "Made for your stream, not to distract you.",
    featureIntro: "A clean interface that keeps the timer, chat and community goals perfectly synchronized.",
    features: [
      ["Pomodoro timer", "Start, pause and configure sessions from your dashboard or directly from chat."],
      ["Community Task List", "Every participant gets their own clearly grouped and easy-to-follow task list."],
      ["OBS overlays", "Choose the timer, Task List or both, with several clean and accessible themes."],
      ["Chat controlled", "Twitch commands become a simple remote control for the streamer and community."],
    ],
    productEyebrow: "SEE THE PRODUCT",
    productTitle: "A clear dashboard. Overlays that fit every stream.",
    timerPreview: "Preview of the Focus Party Pomodoro timer",
    taskPreview: "Preview of the Focus Party community Task List",
    overlayPreview: "Preview of Focus Party browser sources for OBS",
    timerCaption: "The timer stays readable at a glance.",
    taskCaption: "Tasks are separated by participant.",
    overlayCaption: "Three browser sources ready for OBS.",
    howEyebrow: "READY IN A FEW MOMENTS",
    howTitle: "Connect. Configure. Start focusing.",
    steps: [
      ["01", "Connect Twitch", "Allow Focus Party to listen to the useful commands on your channel."],
      ["02", "Set your session", "Choose the focus time, break time and number of cycles."],
      ["03", "Add your overlay", "Copy the browser source into OBS and start your Focus Party."],
    ],
    finalEyebrow: "YOUR NEXT SESSION STARTS HERE",
    finalTitle: "Ready to bring your community in?",
    finalText: "No download. No subscription. Connect Twitch and open your dashboard.",
    github: "View the project on GitHub",
    madeFor: "Free community Pomodoro for Twitch.",
    authError: "Twitch sign-in did not complete. You can try again.",
  },
  es: {
    navProduct: "El producto",
    navFeatures: "Funciones",
    navHow: "Cómo funciona",
    language: "Elegir idioma",
    accessibility: "Visualización",
    standard: "Estándar",
    colorblind: "Daltonismo",
    eyebrow: "POMODORO × TWITCH × OBS",
    titleStart: "La concentración se convierte en",
    titleAccent: "una experiencia colectiva.",
    intro: "Focus Party convierte tu chat de Twitch en un compañero de concentración: temporizador Pomodoro, lista de tareas comunitaria y overlays OBS en un dashboard gratuito.",
    connect: "Conectar con Twitch",
    dashboard: "Abrir mi dashboard",
    discover: "Descubrir el producto",
    permission: "Conexión segura · Permisos de Twitch limitados a lo necesario",
    free: "100 % gratis",
    openSource: "Código abierto",
    obsReady: "Listo para OBS",
    posterAlt: "Vista previa del temporizador Focus Party y sus comandos de Twitch",
    liveLabel: "VISTA PREVIA",
    session: "SESIÓN 1 / 5",
    focus: "FOCUS",
    tasks: "TASK LIST",
    featureEyebrow: "TODO EN UN MISMO LUGAR",
    featureTitle: "Diseñado para tu stream, no para distraerte.",
    featureIntro: "Una interfaz limpia que mantiene sincronizados el temporizador, el chat y los objetivos de tu comunidad.",
    features: [
      ["Temporizador Pomodoro", "Inicia, pausa y configura tus sesiones desde el dashboard o el chat."],
      ["Task List comunitaria", "Cada participante tiene sus tareas agrupadas bajo su nombre y fáciles de seguir."],
      ["Overlays OBS", "Elige temporizador, Task List o ambos, con varios temas sobrios y accesibles."],
      ["Controlado por el chat", "Los comandos de Twitch se convierten en un mando sencillo para todos."],
    ],
    productEyebrow: "EL PRODUCTO EN IMÁGENES",
    productTitle: "Un dashboard claro. Overlays para cualquier stream.",
    timerPreview: "Vista previa del temporizador Pomodoro Focus Party",
    taskPreview: "Vista previa de la Task List comunitaria Focus Party",
    overlayPreview: "Vista previa de las fuentes de navegador para OBS",
    timerCaption: "El temporizador se lee de un vistazo.",
    taskCaption: "Las tareas están separadas por participante.",
    overlayCaption: "Tres fuentes de navegador listas para OBS.",
    howEyebrow: "LISTO EN UNOS INSTANTES",
    howTitle: "Conecta. Configura. Empieza a concentrarte.",
    steps: [
      ["01", "Conecta Twitch", "Autoriza a Focus Party a escuchar los comandos útiles de tu canal."],
      ["02", "Configura tu sesión", "Elige el tiempo de concentración, las pausas y el número de ciclos."],
      ["03", "Añade tu overlay", "Copia la fuente de navegador en OBS y comienza tu Focus Party."],
    ],
    finalEyebrow: "TU PRÓXIMA SESIÓN EMPIEZA AQUÍ",
    finalTitle: "¿Listo para implicar a tu comunidad?",
    finalText: "Sin descarga. Sin suscripción. Conecta Twitch y abre tu dashboard.",
    github: "Ver el proyecto en GitHub",
    madeFor: "Pomodoro comunitario gratuito para Twitch.",
    authError: "La conexión con Twitch no se ha completado. Puedes intentarlo de nuevo.",
  },
} as const;

export default function LandingPage() {
  const [language, setLanguage] = useState<Language>("fr");
  const [visualTheme, setVisualTheme] = useState<VisualTheme>("standard");
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const text = copy[language];

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("focus-party-language");
    const browserLanguage = window.navigator.language.slice(0, 2);
    const nextLanguage = isLanguage(storedLanguage) ? storedLanguage : isLanguage(browserLanguage) ? browserLanguage : "fr";
    const storedTheme = window.localStorage.getItem("focus-party-visual-theme");
    const nextAuthError = new URLSearchParams(window.location.search).get("twitch") === "error";
    const hydrationTimer = window.setTimeout(() => {
      setLanguage(nextLanguage);
      setVisualTheme(storedTheme === "colorblind" ? "colorblind" : "standard");
      setAuthError(nextAuthError);
    }, 0);
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);

    void (async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) return;
        const state = await response.json() as { channel?: { connected?: boolean } };
        setConnected(Boolean(state.channel?.connected));
      } catch {
        // The sign-in action remains available if the status check is interrupted.
      }
    })();
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.visualTheme = visualTheme;
  }, [language, visualTheme]);

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem("focus-party-language", nextLanguage);
  };

  const changeTheme = (nextTheme: VisualTheme) => {
    setVisualTheme(nextTheme);
    window.localStorage.setItem("focus-party-visual-theme", nextTheme);
  };

  const primaryHref = connected ? "/dashboard" : "/api/auth/twitch/start";
  const primaryLabel = connected ? text.dashboard : text.connect;

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="Focus Party — accueil">
          <span className="brand-mark">✦</span>
          <span>FOCUS<em>PARTY</em></span>
        </a>
        <nav className="landing-nav" aria-label="Navigation principale">
          <a href="#product">{text.navProduct}</a>
          <a href="#features">{text.navFeatures}</a>
          <a href="#how">{text.navHow}</a>
        </nav>
        <div className="landing-tools">
          <label className="landing-theme-picker">
            <span aria-hidden="true">◐</span>
            <span className="sr-only">{text.accessibility}</span>
            <select value={visualTheme} onChange={(event) => changeTheme(event.target.value as VisualTheme)} aria-label={text.accessibility}>
              <option value="standard">{text.standard}</option>
              <option value="colorblind">{text.colorblind}</option>
            </select>
          </label>
          <div className="landing-language" role="group" aria-label={text.language}>
            {languageOptions.map((option) => <button key={option.id} className={language === option.id ? "active" : ""} onClick={() => changeLanguage(option.id)} aria-pressed={language === option.id}>{option.short}</button>)}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><i />{text.eyebrow}</p>
            <h1 id="landing-title">{text.titleStart}<br /><span>{text.titleAccent}</span></h1>
            <p className="landing-lead">{text.intro}</p>
            {authError && <p className="landing-auth-error" role="alert">{text.authError}</p>}
            <div className="landing-hero-actions">
              <a className="landing-twitch-cta" href={primaryHref}><span aria-hidden="true">◖◗</span>{primaryLabel}<b>→</b></a>
              <a className="landing-secondary-cta" href="#product">{text.discover}<span>↓</span></a>
            </div>
            <p className="landing-permission"><span aria-hidden="true">◇</span>{text.permission}</p>
            <div className="landing-trust" aria-label="Focus Party">
              <span><i>✓</i>{text.free}</span>
              <span><i>⌘</i>{text.openSource}</span>
              <span><i>▣</i>{text.obsReady}</span>
            </div>
          </div>

          <div className="landing-hero-visual">
            <div className="landing-poster-label"><i />{text.liveLabel}</div>
            <figure className="landing-product-poster" role="img" aria-label={text.posterAlt} />
            <div className="landing-floating-card landing-floating-timer" aria-hidden="true">
              <small>{text.session}</small><strong>24:42</strong><span>{text.focus}</span>
            </div>
            <div className="landing-floating-card landing-floating-tasks" aria-hidden="true">
              <small>{text.tasks}</small><p><i>✓</i> Préparer l’intro</p><p><i /> Finir le montage</p>
            </div>
          </div>
        </section>

        <section className="landing-features" id="features" aria-labelledby="feature-title">
          <div className="landing-section-heading">
            <p>{text.featureEyebrow}</p>
            <h2 id="feature-title">{text.featureTitle}</h2>
            <span>{text.featureIntro}</span>
          </div>
          <div className="landing-feature-grid">
            {text.features.map(([title, description], index) => (
              <article key={title}><span>{["◷", "✓", "▣", "#"][index]}</span><small>0{index + 1}</small><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </section>

        <section className="landing-product" id="product" aria-labelledby="product-title">
          <div className="landing-section-heading centered">
            <p>{text.productEyebrow}</p>
            <h2 id="product-title">{text.productTitle}</h2>
          </div>
          <div className="landing-product-grid">
            <figure className="landing-preview landing-preview-timer">
              <div className="preview-window" role="img" aria-label={text.timerPreview}>
                <header><i /><i /><i /><span>FOCUS PARTY · DASHBOARD</span></header>
                <div className="preview-timer-body"><small>SESSION 1 / 5</small><strong>24:42</strong><em>FOCUS</em><div><i /></div><button>▶ START FOCUS</button></div>
              </div>
              <figcaption>{text.timerCaption}</figcaption>
            </figure>
            <figure className="landing-preview landing-preview-tasks">
              <div className="preview-window" role="img" aria-label={text.taskPreview}>
                <header><i /><i /><i /><span>FOCUS PARTY · TASK LIST</span></header>
                <div className="preview-task-body"><div><b>G</b><strong>Geoffrey</strong><small>2 tâches</small></div><p><i>✓</i><span><small>01</small>Préparer la scène OBS</span></p><p><i /><span><small>02</small>Répondre au chat</span></p><div><b>M</b><strong>Marie</strong><small>1 tâche</small></div><p><i /><span><small>01</small>Terminer le chapitre</span></p></div>
              </div>
              <figcaption>{text.taskCaption}</figcaption>
            </figure>
            <figure className="landing-preview landing-preview-overlays">
              <div className="preview-window" role="img" aria-label={text.overlayPreview}>
                <header><i /><i /><i /><span>FOCUS PARTY · OBS</span></header>
                <div className="preview-overlay-body"><span><b>◷</b><strong>TIMER</strong><small>900 × 300</small></span><span><b>✓</b><strong>TASK LIST</strong><small>650 × 700</small></span><span><b>▣</b><strong>COMBINÉ</strong><small>900 × 600</small></span></div>
              </div>
              <figcaption>{text.overlayCaption}</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-how" id="how" aria-labelledby="how-title">
          <div className="landing-section-heading">
            <p>{text.howEyebrow}</p>
            <h2 id="how-title">{text.howTitle}</h2>
          </div>
          <ol className="landing-steps">
            {text.steps.map(([number, title, description]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}
          </ol>
        </section>

        <section className="landing-final-cta">
          <p>{text.finalEyebrow}</p>
          <h2>{text.finalTitle}</h2>
          <span>{text.finalText}</span>
          <a className="landing-twitch-cta light" href={primaryHref}><span aria-hidden="true">◖◗</span>{primaryLabel}<b>→</b></a>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top"><span className="brand-mark">✦</span><span>FOCUS<em>PARTY</em></span></a>
        <p>{text.madeFor}</p>
        <a href="https://github.com/galco33/focus-party" target="_blank" rel="noreferrer">{text.github} ↗</a>
      </footer>
    </div>
  );
}
