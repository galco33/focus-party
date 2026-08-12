# Contribuer à Focus Party

Merci de vouloir améliorer Focus Party. Les contributions peuvent concerner le bot Twitch, le dashboard, l’overlay OBS, la documentation, l’accessibilité ou la sécurité.

## Avant de commencer

1. Vérifiez qu’une issue similaire n’existe pas déjà.
2. Pour une modification importante, ouvrez d’abord une discussion ou une issue afin de valider l’approche.
3. Ne publiez jamais de Client Secret Twitch, de jeton OAuth ou de secret Cloudflare.

## Préparer une contribution

```bash
git clone URL_DE_VOTRE_FORK
cd focus-party
npm install
git checkout -b type/description-courte
```

Commencez par utiliser le bouton **Fork** sur GitHub, puis remplacez `URL_DE_VOTRE_FORK` par l’adresse de votre copie.

Noms de branches conseillés :

- `feat/nouvelle-commande` pour une fonctionnalité ;
- `fix/timer-pause` pour une correction ;
- `docs/installation` pour la documentation.

## Règles du projet

- Conservez TypeScript en mode strict et évitez `any`.
- Isolez toujours les données par `channelId` et, pour les tâches, par `userId`.
- Vérifiez les permissions côté serveur, jamais uniquement dans l’interface.
- Validez les entrées provenant du chat Twitch.
- N’enregistrez pas de secret ni de jeton en clair.
- Gardez le serveur comme source de vérité du minuteur.
- Ajoutez ou adaptez les tests pour tout changement de comportement.

## Vérifications obligatoires

```bash
npm run lint
npm run typecheck
npm test
```

## Pull request

Une pull request doit expliquer :

- le problème résolu ;
- le comportement avant et après ;
- la manière de tester la modification ;
- les éventuels changements de configuration ou de base de données.

Les petites pull requests ciblées sont plus simples à relire et à fusionner.

En participant, vous acceptez que votre contribution soit distribuée sous la licence MIT du projet et vous vous engagez à respecter le [Code de conduite](CODE_OF_CONDUCT.md).
