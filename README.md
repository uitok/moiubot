# MoiuBot

MoiuBot is a distributed qBittorrent management bot that uses Telegram as the control plane. It is built with Node.js, Telegraf, Express, and SQLite, and supports rclone-based archiving workflows (download, move, cleanup) across multiple hosts.

## Services

- Bot (`bot/`): Telegraf Telegram bot. Orchestrates user workflows and persists state in SQLite.
- Agent (`agent/`): Express API deployed per qBittorrent host. Talks to the qBittorrent Web API, runs rclone operations, and monitors completed downloads.
- Config Server (`config-server/`, optional): Express service that distributes a shared `rclone.conf` to Agents for centralized rclone remote management.

## Features

- Manage multiple qBittorrent instances from a single Telegram bot.
- Guided "add torrent" workflow with optional auto-archive to cloud storage via rclone.
- Agent-side completion monitoring with post-move cleanup.
- Optional centralized rclone configuration distribution with basic versioning.
- SQLite-backed persistence for users, servers, tasks, and category mappings.
- Docker Compose and systemd deployment assets included in this repository.

## Requirements

- Node.js 18+ (Node 22 recommended)
- Telegram bot token (from BotFather)
- qBittorrent with Web UI enabled on each Agent host
- rclone installed on each Agent host (and on the Config Server host if used)

## Quick Start (Local)

1. Install dependencies:

```bash
npm install
```

2. Create environment files:

```bash
cp .env.bot.example .env.bot
cp .env.agent.example .env.agent
cp .env.config-server.example .env.config-server
```

3. Edit the env files and set secrets (Telegram token, API keys, qBittorrent credentials). If you do not use the Config Server, you can skip `.env.config-server` and the `config-server/` service.

4. Initialize the database:

```bash
npm run init-db
```

5. Start services:

```bash
npm run start:agent
npm start
```

## Docker Compose

This repo includes `docker-compose.yml` plus `Dockerfile.bot` and `Dockerfile.agent`.

```bash
docker compose up --build
```

Notes:

- The Agent container is configured to reach a qBittorrent instance running on the Docker host via `QBT_URL=http://host.docker.internal:18080` (see `docker-compose.yml`).
- The Bot can optionally expose an Agent-to-Bot webhook listener when `BOT_WEBHOOK_PORT` is set (see `.env.bot.example` and `bot/webhook-server.js`).

## Configuration Notes

- Secrets and local state must not be committed. `.gitignore` excludes `.env*`, database files, and `runtime/` by default.
- SQLite path is controlled by `DATABASE_PATH` (default `./database/qbt-bot.db`).
- Bot access can be restricted with `ALLOWED_USERS` (comma-separated Telegram user IDs). If unset, the bot allows all users.
- The Agent protects all `/api/*` endpoints with `API_KEY`.
- Optional rclone config distribution: run the Config Server with `RCLONE_CONFIG` pointing to a writable path (a safe default for this repo is `runtime/rclone/rclone.conf`), and configure Agents with `CONFIG_SERVER_URL`, `CONFIG_SERVER_API_KEY`, and `RCLONE_SYNC_ON_START=true`.

## Deployment

- systemd unit templates are in `deploy/systemd/`.
- `start.sh` provides a local process launcher for the services.

## License

MIT
