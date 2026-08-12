# Sécurité

## Versions prises en charge

Le projet évolue rapidement. Seule la dernière version de la branche principale reçoit les correctifs de sécurité.

## Signaler une vulnérabilité

N’ouvrez pas d’issue publique si une faille peut exposer des comptes, des jetons Twitch ou des données de chaîne. Utilisez la fonction **Private vulnerability reporting** de l’onglet Security du dépôt GitHub.

Indiquez si possible :

- la partie concernée ;
- les étapes de reproduction ;
- l’impact observé ;
- une proposition de correction, si vous en avez une.

Ne joignez jamais de véritables secrets, cookies ou jetons OAuth. Révoquez immédiatement toute valeur accidentellement exposée.

## Secrets attendus

Ces valeurs doivent rester uniquement dans le gestionnaire de secrets Cloudflare :

- `TWITCH_CLIENT_SECRET` ;
- `TWITCH_EVENTSUB_SECRET` ;
- `TWITCH_TOKEN_ENCRYPTION_KEY`.

Le Client ID Twitch et l’identifiant public d’une base D1 ne permettent pas, à eux seuls, d’accéder aux comptes ou aux données.
