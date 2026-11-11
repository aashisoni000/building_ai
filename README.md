# CampusBite

CampusBite is an SRM canteen ordering assistant. Students can ask about the menu, wallet, and pickup slots in plain English, place or cancel orders through the agent, and check recent orders. A kitchen board tracks orders from placed through collected.

**Stack:** Next.js App Router · React · TypeScript · Tailwind CSS · Supabase PostgreSQL · Google Gemini function calling · Zod · Vercel

## Features

- Passcode-protected app and API routes
- Student chat with six server-side agent tools:
  - `getMenu`, `getWalletBalance`, `getPickupSlots`, `getMyOrders`
  - `placeOrder`, `cancelOrder`
- Order placement and cancellation use the database functions in the CampusBite seed. The database checks wallet balance, stock, pickup capacity, and cancellation eligibility atomically.
- Student dashboard with wallet, today's orders, and menu availability
- Kitchen board at `/kitchen` with **New orders**, **Preparing**, and **Ready for pickup** columns
- Kitchen order status transitions: `placed` → `preparing` → `ready` → `collected`
- Menu and student panels refresh every five seconds; the kitchen board polls every three seconds.
- `/api/health` reports configured environment variables and checks that Supabase can read `menu_items`.

## Setup

### 1. Install

Use Node.js 20 or later:

```bash
npm install
```

### 2. Create and seed Supabase

Create a project at [supabase.com](https://supabase.com), open **SQL Editor**, and run the complete [`seed/campusbite.sql`](./seed/campusbite.sql) script.

This script creates the CampusBite tables, sample menu, wallets, pickup slots, sample orders, and the `place_order` and `cancel_order` database functions. **It is also a reset script:** running it again drops and recreates the CampusBite tables and resets their data. You do not need to run `seed/00_starter_example.sql` for this app.

The demo student is `S001` (Priya Ramesh). The app selects this ID in `lib/campusbite.ts`; it is not supplied by the browser or the agent.

### 3. Configure local environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio API key for the agent |
| `GEMINI_MODEL` | Optional model name; the application has a default |
| `SUPABASE_URL` | URL of the Supabase project where you ran `campusbite.sql` |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret/service-role key |
| `APP_PASSCODE` | Shared passcode protecting the app |

Never commit `.env.local`, expose `SUPABASE_SECRET_KEY` to browser code, or paste credentials into chat or screenshots.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter the passcode, and try the sample prompts. Visit `/kitchen` for the kitchen board.

### 5. Deploy to Vercel

Import the repository into Vercel and add the environment variables above to the **Production** environment. Make sure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` belong to the same Supabase project where the seed was run. Redeploy after changing variables.

Check `https://<your-deployment>/api/health`. A healthy response has all required settings set to `true` and `database.menu_items` set to `true`. If the tables exist in SQL Editor but the API reports a schema-cache error, confirm `public` is an exposed schema in Supabase API settings and reload the PostgREST schema cache:

```sql
NOTIFY pgrst, 'reload schema';
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Student chat, wallet/orders, and live menu |
| `/kitchen` | Kitchen order board and status controls |
| `/api/agent` | Agent chat and tool execution |
| `/api/menu` | All menu items, including sold-out items |
| `/api/me` | Demo student's wallet and five latest orders |
| `/api/kitchen` | Active kitchen orders; `POST` advances an order to the next status |
| `/api/health` | Environment configuration and Supabase menu-table check |
| `/api/login`, `/api/logout` | Passcode login/logout |

## Project structure

```text
app/
  page.tsx                 Student dashboard
  kitchen/page.tsx         Kitchen order board
  login/page.tsx           Passcode login
  api/agent/route.ts       Gemini agent endpoint
  api/health/route.ts      Configuration and database check
  api/kitchen/route.ts     Kitchen order list and status updates
  api/me/route.ts          Student wallet and order history
  api/menu/route.ts        Menu endpoint
components/
  AgentChat.tsx            Agent chat and tool-call display
  MenuPanel.tsx            Live categorized menu
  WalletOrders.tsx         Wallet balance and recent orders
lib/
  agent/tools.ts            CampusBite tools
  agent/systemPrompt.ts     Agent ordering rules
  agent/runAgent.ts         Gemini function-calling loop
  campusbite.ts             Demo student ID and pickup-time formatting
  supabase.ts               Server-side Supabase client
seed/
  campusbite.sql            CampusBite schema, functions, and demo data
```

## Important demo limitations

- The app uses one shared passcode and a fixed demo student ID, not individual student authentication. Do not use this identity model for real wallet or payment data.
- The passcode gate protects app routes, including `/kitchen`, but there is no separate kitchen-role authorization.
- Order placement and cancellation mutate the seeded demo database. A successful order deducts wallet balance, reduces stock, and books a pickup slot.
- If Gemini is temporarily unavailable, some matching read-only questions and the specific demo lunch-with-sweet order flow can use live Supabase data directly. Any fallback order is a real database order, not a mock response.

## Validation

Before deploying, run:

```bash
npm run typecheck
npm run build
```
