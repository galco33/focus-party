# Focus Party

**English** · [Français](README.fr.md)

[![CI](https://github.com/galco33/focus-party/actions/workflows/ci.yml/badge.svg)](https://github.com/galco33/focus-party/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Focus Party is a **community Pomodoro platform for Twitch**. The chat becomes the session remote control: the streamer runs the timer, viewers manage their personal tasks, and an OBS overlay displays live progress.

The project is fully open source under the MIT License. You can fork it, customize the interface, add commands, or host it on your own Cloudflare account.

**Public demo:** [focus-party-pomodoro-g97.focus-party-g97.workers.dev](https://focus-party-pomodoro-g97.focus-party-g97.workers.dev/)

## Features

- secure sign-in for each streamer with Twitch OAuth;
- Twitch chat message delivery through EventSub;
- bot replies sent directly to the channel chat;
- Pomodoro timer controlled from Twitch;
- personal task lists isolated by viewer and channel;
- real-time synchronization between the dashboard and OBS overlays;
- optional bell when focus ends, focus resumes, or the final session finishes;
- optional PNG logo with customizable size and position across all three OBS sources;
- multi-channel support, with separate data for every streamer;
- encrypted Twitch tokens before storage in Cloudflare D1.

## Twitch commands

| Command | Effect | Access |
| --- | --- | --- |
| `!pomo 5` | Sets 5 sessions | Streamer |
| `!timer 25/5` | Sets 25 minutes of focus and a 5-minute break | Streamer |
| `!pomo start` | Starts the Pomodoro | Streamer |
| `!pomo pause` | Pauses the timer | Streamer |
| `!pomo resume` | Resumes the timer | Streamer |
| `!pomo stop` | Stops the timer | Streamer |
| `!pomo status` | Shows the current timer status | Everyone |
| `!task add My goal` | Adds a personal task | Everyone |
| `!task` | Shows personal tasks | Everyone |
| `!taskhelp` | Shows the Task List command help | Everyone |
| `!task focus 1` | Highlights task number 1 as the active task | Everyone |
| `!task edit 1 New goal` | Edits task number 1 | Everyone |
| `!task done 1` | Completes task number 1 | Everyone |
| `!task remove 1` | Removes task number 1 | Everyone |
| `!task clear` | Removes completed personal tasks | Everyone |
| `!task clear all` | Removes every task in the channel, including other viewers’ tasks | Streamer only |

A viewer can never change another viewer’s tasks. Only the streamer can use `!task clear all` to reset the whole channel Task List. The same person can keep separate lists across multiple channels.

## Audio in OBS

The **Timer** and **Timer + Task List** sources play a bell on every phase change. Sound is enabled by default and can be disabled or tested from the overlay page. In OBS, enable **Control audio via OBS** in the Browser source properties, then make sure the source is not muted in the Audio Mixer.

## Architecture

```text
Twitch chat ──EventSub──> Cloudflare Worker ──> D1 (data)
                              │               └──> PNG logos
                              ├──> API / commands / OAuth
                              │
                              └──> Durable Object ──WebSocket──> Dashboard + OBS overlay
```

Core technologies: TypeScript, React 19, Vinext/Vite, Cloudflare Workers, D1, Durable Objects, Twitch OAuth, and EventSub.

A more detailed technical description is available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development

Requirement: Node.js 22.13 or newer.

```bash
git clone https://github.com/galco33/focus-party.git
cd focus-party
npm install
npm run dev
```

Then open `http://localhost:3000`. You can develop the dashboard and overlay locally. To test the complete Twitch flow, also add the local callback URL to your Twitch application and provide the required local environment variables.

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
```

## Free Cloudflare deployment

### 1. Create the D1 database

Connect Wrangler to your account, then create a database:

```bash
npx wrangler login
npx wrangler d1 create focus-party-db
```

### 2. Prepare the configuration

Copy `wrangler.example.jsonc` to `wrangler.cloudflare.jsonc`, then replace:

- `VOTRE_NOM_DE_WORKER` with your Worker name;
- `VOTRE_DATABASE_ID` with the identifier returned in the previous step;
- `VOTRE_TWITCH_CLIENT_ID` with your Twitch application’s public Client ID.

`wrangler.cloudflare.jsonc` is ignored by Git so each personal deployment remains separate from the public project.

### 3. Create the Twitch application

In the [Twitch developer console](https://dev.twitch.tv/console/apps), create a **Confidential** application. Register this redirect URL, adapted to your Worker:

```text
https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/api/auth/twitch/callback
```

### 4. Save the secrets

```bash
npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.cloudflare.jsonc
npx wrangler secret put TWITCH_EVENTSUB_SECRET --config wrangler.cloudflare.jsonc
npx wrangler secret put TWITCH_TOKEN_ENCRYPTION_KEY --config wrangler.cloudflare.jsonc
```

`TWITCH_CLIENT_SECRET` comes from the Twitch developer console. For the other two values, generate two different random strings:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`TWITCH_TOKEN_ENCRYPTION_KEY` must contain exactly 64 hexadecimal characters. Never publish any of these three secrets.

### 5. Initialize and deploy

```bash
npm run build
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
npx wrangler deploy --config wrangler.cloudflare.jsonc
```

Finally, add the exact Worker URL to the Twitch developer console if it differs from the one you planned.

## Customizing the project

- Bot commands, permissions, limits, and replies are in `lib/focus-party.ts`.
- OAuth and EventSub integration is in `lib/twitch.ts` and `app/api/`.
- The dashboard is in `app/Dashboard.tsx`.
- The OBS overlay is in `app/overlay/`.
- Global styles are in `app/globals.css`.
- The data schema is in `db/schema.ts`, with migrations in `drizzle/`.
- The WebSocket channel is managed in `worker/index.ts`.

If you change the database schema:

```bash
npm run db:generate
```

Carefully review the generated migration before applying it.

## Contributing

Bug fixes, ideas, new overlay themes, translations, and new commands are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

Focus Party is released under the [MIT License](LICENSE). You may use, modify, and redistribute it, including in commercial projects, as long as you preserve the license notice.
