# Focus Party

[![CI](https://github.com/galco33/focus-party/actions/workflows/ci.yml/badge.svg)](https://github.com/galco33/focus-party/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-green.svg)](LICENSE)

Focus Party est une plateforme de **Pomodoro communautaire pour Twitch**. Le chat devient la télécommande de la session : le streamer pilote le minuteur, les viewers gèrent leurs tâches personnelles et un overlay OBS affiche l’avancement en direct.

Le projet est entièrement open source sous licence MIT. Vous pouvez le forker, modifier l’interface, ajouter des commandes ou l’héberger sur votre propre compte Cloudflare.

**Démo publique :** [focus-party-pomodoro-g97.focus-party-g97.workers.dev](https://focus-party-pomodoro-g97.focus-party-g97.workers.dev/)

## Ce que fait l’application

- connexion sécurisée de chaque streamer avec Twitch OAuth ;
- réception des messages du chat avec Twitch EventSub ;
- réponses du bot directement dans le chat de la chaîne ;
- minuteur Pomodoro contrôlé depuis Twitch ;
- listes de tâches personnelles, isolées par viewer et par chaîne ;
- dashboard et overlay OBS synchronisés en temps réel ;
- ajout facultatif d’un logo PNG avec taille et position personnalisables dans les trois sources OBS ;
- fonctionnement multi-chaînes : chaque streamer possède ses propres données ;
- chiffrement des jetons Twitch avant leur stockage dans Cloudflare D1.

## Commandes Twitch

| Commande | Effet | Accès |
| --- | --- | --- |
| `!pomo 5` | Configure 5 sessions | Streamer |
| `!timer 25/5` | Configure 25 min de focus et 5 min de pause | Streamer |
| `!pomo start` | Démarre le Pomodoro | Streamer |
| `!pomo pause` | Met le minuteur en pause | Streamer |
| `!pomo resume` | Reprend le minuteur | Streamer |
| `!pomo stop` | Arrête le Pomodoro | Streamer |
| `!pomo status` | Affiche l’état actuel | Tout le monde |
| `!task add Mon objectif` | Ajoute une tâche personnelle | Tout le monde |
| `!task` | Affiche ses tâches | Tout le monde |
| `!task done 1` | Termine sa tâche n°1 | Tout le monde |
| `!task remove 1` | Supprime sa tâche n°1 | Tout le monde |
| `!task clear` | Supprime ses tâches terminées | Tout le monde |
| `!task clear all` | Supprime toutes les tâches terminées de la chaîne | Streamer |

Un viewer ne peut jamais modifier les tâches d’un autre viewer. Une personne peut conserver des listes différentes sur plusieurs chaînes.

## Architecture

```text
Chat Twitch ──EventSub──> Worker Cloudflare ──> D1 (données)
                              │               └──> logos PNG
                              ├──> API / commandes / OAuth
                              │
                              └──> Durable Object ──WebSocket──> Dashboard + overlay OBS
```

Technologies principales : TypeScript, React 19, Vinext/Vite, Cloudflare Workers, D1, Durable Objects, Twitch OAuth et EventSub.

Une description plus détaillée est disponible dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Installation locale

Prérequis : Node.js 22.13 ou plus récent.

```bash
git clone https://github.com/galco33/focus-party.git
cd focus-party
npm install
npm run dev
```

Ouvrez ensuite `http://localhost:3000`. Le dashboard et l’overlay peuvent être développés localement. Pour tester le parcours Twitch complet, ajoutez aussi l’URL locale de callback dans votre application Twitch et renseignez les variables nécessaires dans votre environnement local.

Commandes de contrôle :

```bash
npm run lint
npm run typecheck
npm test
```

## Déploiement gratuit sur Cloudflare

### 1. Créer la base D1

Connectez Wrangler à votre compte puis créez une base :

```bash
npx wrangler login
npx wrangler d1 create focus-party-db
```

### 2. Préparer la configuration

Copiez `wrangler.example.jsonc` vers `wrangler.cloudflare.jsonc`, puis remplacez :

- `VOTRE_NOM_DE_WORKER` ;
- `VOTRE_DATABASE_ID` par l’identifiant renvoyé à l’étape précédente ;
- `VOTRE_TWITCH_CLIENT_ID` par le Client ID public de votre application Twitch.

Le fichier `wrangler.cloudflare.jsonc` est ignoré par Git afin de garder chaque déploiement personnel séparé du projet public.

### 3. Créer l’application Twitch

Dans la [console développeur Twitch](https://dev.twitch.tv/console/apps), créez une application de type **Confidential**. Enregistrez cette URL de redirection, adaptée à votre Worker :

```text
https://VOTRE_WORKER.VOTRE_SOUS_DOMAINE.workers.dev/api/auth/twitch/callback
```

### 4. Enregistrer les secrets

```bash
npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.cloudflare.jsonc
npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.cloudflare.jsonc
npx wrangler secret put TWITCH_TOKEN_ENCRYPTION_KEY --config wrangler.cloudflare.jsonc
```

`TWITCH_CLIENT_SECRET` vient de la console Twitch. Pour les deux autres valeurs, générez deux chaînes aléatoires différentes :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

La clé `TWITCH_TOKEN_ENCRYPTION_KEY` doit contenir exactement 64 caractères hexadécimaux. Ne publiez jamais ces trois secrets.

### 5. Initialiser et déployer

```bash
npm run build
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
npx wrangler deploy --config wrangler.cloudflare.jsonc
```

Ajoutez ensuite l’URL exacte du Worker dans la console Twitch si elle diffère de celle prévue.

## Modifier le projet

- Les commandes, permissions, limites et réponses du bot sont dans `lib/focus-party.ts`.
- L’intégration OAuth/EventSub est dans `lib/twitch.ts` et `app/api/`.
- Le dashboard est dans `app/Dashboard.tsx`.
- L’overlay OBS est dans `app/overlay/`.
- Le style global est dans `app/globals.css`.
- Le schéma de données est dans `db/schema.ts` et les migrations dans `drizzle/`.
- Le canal WebSocket est géré dans `worker/index.ts`.

Si vous changez le schéma de la base :

```bash
npm run db:generate
```

Puis vérifiez soigneusement la migration créée avant de l’appliquer.

## Contribuer

Les corrections, idées, nouveaux thèmes d’overlay, traductions et nouvelles commandes sont bienvenues. Consultez [CONTRIBUTING.md](CONTRIBUTING.md) avant d’ouvrir une pull request et [SECURITY.md](SECURITY.md) pour signaler une vulnérabilité.

## Licence

Focus Party est distribué sous licence [MIT](LICENSE). Vous pouvez l’utiliser, le modifier et le redistribuer, y compris dans un projet commercial, à condition de conserver l’avis de licence.
