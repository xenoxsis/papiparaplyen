# Pap i Paraplyen

Member portal for the board game club **Pap i Paraplyen**.

Built with Next.js 16, Express, and bcrypt. Data is stored in flat JSON files on the backend so the app runs without a database server.

---

## Features

- **Public pages** — Home, Events, Calendar, About
- **Login / Register** — Email + bcrypt-hashed password authentication
- **Member area**
  - Profile page with upcoming confirmed shifts and pending shift confirmations
  - Schedule (vagtplan) with opt-out, filter, and "I have reviewed" banner
  - Chat channels (Alle medlemmer, Vagter)
- **Admin area** — Member management
- **Roles** — Vagt, Administrator, Medlem

---

## Tech stack

| Layer           | Technology                                           |
| --------------- | ---------------------------------------------------- |
| Frontend        | Next.js 16 (App Router), Tailwind CSS v4, TypeScript |
| Backend         | Express 4, TypeScript, bcrypt                        |
| Package manager | pnpm (workspaces)                                    |
| Container       | Docker + pm2 (single image, single port)             |

---

## Getting started (development)

```bash
# Install all workspace dependencies
pnpm install

# Terminal 1 – backend (port 3001)
cd backend
pnpm dev

# Terminal 2 – frontend (port 3000)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running with Docker

```bash
docker build -t paraplyen .
docker run -p 3000:3000 paraplyen
```

Only port `3000` needs to be exposed. The frontend proxies all `/api/*` requests internally to the Express backend.

---

## Project structure

```
paraplyen/
├── src/                    # Next.js frontend
│   ├── app/(site)/         # Pages (home, events, about, login, member/*)
│   ├── components/         # Shared UI components
│   └── lib/                # API client, auth context
├── backend/
│   ├── src/
│   │   ├── routes/         # Express route handlers
│   │   ├── db/
│   │   │   ├── index.ts    # readTable / writeTable helpers
│   │   │   └── data/       # JSON flat-file database (gitignored)
│   │   └── scripts/        # One-time maintenance scripts
│   └── package.json
├── database/
│   └── setup.sql           # MSSQL schema + seed script
├── Dockerfile
├── ecosystem.config.cjs    # pm2 process config
└── next.config.ts
```

---

## Database

The app ships with a flat-file JSON store (`backend/src/db/data/`) that is **gitignored**. To migrate to MSSQL, run `database/setup.sql` against an empty database and update the backend's `readTable`/`writeTable` calls to use a SQL driver.

Passwords are hashed with **bcrypt** (12 rounds). To hash existing plaintext passwords in the JSON store:

```bash
cd backend
npx tsx src/scripts/hash-passwords.ts
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
