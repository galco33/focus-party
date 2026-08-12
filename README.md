# Focus Party

Focus Party transforme le véritable chat d’une chaîne Twitch en télécommande pour une session Pomodoro communautaire. L’application est conçue pour Cloudflare Workers, D1 et Durable Objects.

Le site publié est multi-utilisateur : toute personne possédant le lien peut autoriser sa propre chaîne Twitch. Les sessions, jetons, timers, tâches, événements de chat et canaux temps réel sont séparés par identifiant de chaîne.

## Fonctionnalités

- connexion Twitch sécurisée par OAuth ;
- réception des commandes réelles avec Twitch EventSub ;
- réponses automatiques publiées dans le chat de la chaîne ;
- commandes `!pomo`, `!timer` et `!task` avec permissions et cooldown persistant ;
- timer dont le serveur est la source de vérité ;
- tâches cloisonnées par chaîne et par utilisateur Twitch ;
- dashboard et overlay OBS synchronisés en temps réel ;
- jetons Twitch chiffrés avant leur stockage dans Cloudflare D1 ;
- interface responsive et utilisable au clavier.

## Démarrage local

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:3000`. La connexion Twitch locale nécessite une seconde URL de redirection enregistrée dans la console Twitch.

## Configuration Twitch

L’application Twitch doit être de type **Confidentiel**. Pour la version publiée, l’URL de redirection autorisée est :

```text
https://focus-party-pomodoro-g97.focus-party-g97.workers.dev/api/auth/twitch/callback
```

Le Client ID public est configuré dans `wrangler.cloudflare.jsonc`. Les trois valeurs suivantes doivent être enregistrées comme secrets Cloudflare et ne doivent jamais être ajoutées au dépôt :

- `TWITCH_CLIENT_SECRET` ;
- `TWITCH_EVENTSUB_SECRET` ;
- `TWITCH_TOKEN_ENCRYPTION_KEY`.

## Commandes utiles

```bash
npm run build
npm run lint
npm test
npm run db:generate
```

## Structure

- `app/Dashboard.tsx` : tableau de bord et connexion Twitch ;
- `app/overlay/` : source navigateur OBS ;
- `app/api/auth/twitch/` : parcours OAuth ;
- `app/api/twitch/eventsub/` : réception sécurisée du chat ;
- `lib/focus-party.ts` : commandes, permissions, timer et tâches ;
- `db/schema.ts` et `drizzle/` : schéma SQLite et migrations ;
- `worker/index.ts` : application et canal WebSocket temps réel.

## OBS

Après la connexion Twitch, copiez l’URL générée dans la rubrique **Overlay OBS**. Ajoutez-la comme source **Navigateur** dans OBS avec une taille d’au moins 900 × 500 px. Le fond reste transparent.
