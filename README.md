# Focus Party

Focus Party transforme le chat Twitch en télécommande d’une session Pomodoro communautaire. Cette V1 inclut un dashboard streamer, un overlay OBS transparent, un simulateur de commandes, un timer dont le serveur est la source de vérité et des tâches cloisonnées par chaîne et par utilisateur Twitch.

## Fonctionnalités

- configuration focus / pause / nombre de sessions ;
- démarrage, pause, reprise, arrêt et transitions automatiques ;
- commandes `!pomo`, `!timer` et `!task` avec permissions et cooldown ;
- tâches persistées avec validation, limite et contrôle de propriété ;
- mise à jour de l’overlay via WebSocket, avec resynchronisation serveur ;
- source OBS dédiée sur `/overlay`, entièrement transparente ;
- stockage SQLite compatible via Cloudflare D1 et migrations Drizzle ;
- interface responsive et utilisable au clavier.

## Démarrage local

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:3000`. Le projet démarre avec une chaîne et quelques tâches de démonstration. Le simulateur de chat permet de tester tout le parcours sans compte Twitch.

## Commandes utiles

```bash
npm run build
npm run lint
npm test
npm run db:generate
```

## Structure

- `app/Dashboard.tsx` : dashboard et simulateur de chat ;
- `app/overlay/` : source navigateur OBS ;
- `app/api/state/route.ts` : commandes, permissions, timer et tâches ;
- `db/schema.ts` et `drizzle/` : schéma SQLite et migration ;
- `worker/index.ts` : application et canal WebSocket temps réel.

## Connexion Twitch

Le parcours interactif fonctionne actuellement en mode démo. Pour une exploitation sur une vraie chaîne, branchez le flux OAuth Authorization Code et un transport Twitch EventSub `channel.chat.message` au même point d’entrée de commandes. Les jetons doivent rester chiffrés côté serveur et ne jamais être exposés au dashboard ou à l’overlay.

## OBS

Ajoutez une source **Navigateur**, collez l’URL `/overlay`, puis choisissez une taille d’au moins 900 × 500 px. Le fond de la page est transparent.
