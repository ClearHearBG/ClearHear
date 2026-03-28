# ClearHear

ClearHear is an Android-only mobile app that helps people who cannot afford hearing aids by turning regular headphones or earbuds into a lightweight hearing-support tool.

## Main features

- Guided ear test that measures each ear across multiple frequencies and builds a hearing profile.
- Live listening mode that routes nearby sound through connected headphones or earbuds and boosts audio based on the user profile.
- Per-user sound tuning with amplification, frequency mapping, noise filtering, and preferred input/output device selection.
- Local rolling audio buffer that can capture recent conversation audio and turn it into a recap.
- Recap history that saves transcribed snippets so users can revisit what was just said.
- AI recap chat that answers questions about saved recaps, such as what was important, who was mentioned, or whether a time was discussed.

## Project structure

- `frontend/app` - Expo React Native app.
- `server` - NestJS API for transcription, recap storage, and transcript chat.

## Quick start

### Frontend

```bash
cd frontend/app
npm install
npm run android
```

### Server

```bash
cd server
cp .env.example .env
pnpm install
pnpm prisma generate
pnpm build
pnpm start:dev
```

## Deployment

The server Docker image is published to GHCR from `.github/workflows/server-publish.yml` whenever changes under `server/**` are pushed to `main`. The workflow pushes:

- `ghcr.io/<owner>/clearhear-server:latest`
- `ghcr.io/<owner>/clearhear-server:<short-sha>`

You can also run the backend locally with `server/docker-compose.yaml`.
