# Architecture de Focus Party

## Parcours principal

1. Le streamer se connecte avec Twitch depuis le dashboard.
2. Le Worker échange le code OAuth, vérifie l’identité Twitch et chiffre les jetons avant de les stocker dans D1.
3. Le Worker crée un abonnement EventSub pour les messages du chat de cette chaîne.
4. Twitch envoie chaque commande au webhook `/api/twitch/eventsub`.
5. Le serveur vérifie la signature, évite les doublons, détermine le rôle de l’auteur et exécute la commande.
6. L’état est enregistré dans D1 puis diffusé par WebSocket au dashboard et à l’overlay OBS.

## Composants

| Composant | Responsabilité |
| --- | --- |
| `app/Dashboard.tsx` | Connexion Twitch, état du Pomodoro, tâches et URL OBS |
| `app/overlay/` | Affichage transparent destiné à une Browser Source OBS |
| `app/api/auth/twitch/` | Début OAuth, callback et déconnexion |
| `app/api/twitch/eventsub/` | Vérification et traitement des événements Twitch |
| `lib/twitch.ts` | API Twitch, abonnements, réponses chat et chiffrement |
| `lib/focus-party.ts` | Parser de commandes, permissions, minuteur et tâches |
| `lib/session.ts` | Sessions du dashboard et protection du parcours OAuth |
| `db/schema.ts` | Modèle de données SQLite/D1 |
| `worker/index.ts` | Entrée Cloudflare et Durable Object temps réel |

## Isolation multi-utilisateur

La clé de séparation principale est l’identifiant Twitch de la chaîne. Le minuteur, les tâches, les sessions et le canal WebSocket utilisent tous cette valeur. Une tâche appartient en plus à l’identifiant Twitch de son auteur.

Toute nouvelle requête doit conserver ces contraintes. Une requête SQL sans filtre `channel_id` peut créer une fuite de données entre deux streamers.

## Minuteur

D1 stocke l’état et les dates du Pomodoro. Le temps restant est calculé côté serveur à partir de ces valeurs : le navigateur n’est pas la source de vérité. Une actualisation de l’overlay ne redémarre donc pas la session.

Le Durable Object fournit le canal temps réel. Après une commande ou un changement d’état, les clients connectés reçoivent un nouvel instantané.

## Sécurité Twitch

- Le parcours OAuth utilise un `state` à usage unique.
- Les sessions sont stockées sous forme de hash et envoyées dans un cookie `HttpOnly`, `Secure` et `SameSite=Lax`.
- Les jetons Twitch sont chiffrés en AES-GCM avec une clé fournie par un secret Cloudflare.
- Les requêtes EventSub sont validées avec leur signature HMAC et leur horodatage.
- Les identifiants de messages Twitch permettent d’empêcher un traitement en double.
- Les permissions sont recalculées côté serveur à partir de l’auteur et de ses badges Twitch.

## Ajouter une commande

Les commandes sont enregistrées dans la table `handlers` de `lib/focus-party.ts`. Une nouvelle commande doit :

1. valider ses arguments ;
2. vérifier le rôle requis ;
3. inclure `channelId` dans toutes les opérations ;
4. inclure l’identifiant utilisateur pour toute donnée personnelle ;
5. retourner une réponse courte adaptée au chat Twitch ;
6. respecter le cooldown commun ou définir explicitement son besoin ;
7. être couverte par un test.

## Faire évoluer la base

Modifiez `db/schema.ts`, lancez `npm run db:generate`, relisez le SQL produit dans `drizzle/`, puis testez la migration localement avant de l’appliquer à une base distante.
