# clockwise-alt

Personal calendar automation via Google Apps Script. Replaces two features from the now-defunct Clockwise:

1. **Personal → Work sync** — Mirrors personal Google Calendar events as "Busy" blocks on your work calendar. Excludes weekends and all-day events. Stays in sync: moved or deleted personal events are reflected automatically.

2. **Auto-schedule lunch** — Finds a free slot within your preferred lunch window each day and blocks it off. Automatically reschedules if a meeting gets booked over it.

## How it works

- A Google Apps Script runs on your **work** Google account
- You share your **personal** Google Calendar with your work account (read-only)
- The script reads both calendars via the Calendar Advanced Service — no OAuth tokens, no expiring credentials
- It creates/updates/deletes events on your work calendar
- All configuration is stored in Script Properties (never in code)

## Prerequisites

- A work Google Workspace account
- A personal Google account (Gmail)
- Node.js 18+ and npm
- `clasp` CLI (installed via `npm install`)

## Quick Setup

The interactive setup wizard handles dependencies, project creation, configuration, and authorization:

```bash
git clone https://github.com/gadig17/clockwise-alt.git clockwise-alt
cd clockwise-alt
npm install
npm run setup
```

The wizard walks you through every step interactively (~10 minutes). If you have the `gcloud` CLI installed (`brew install --cask google-cloud-sdk`), it can also create your GCP project and enable APIs automatically.

> If you prefer to set things up manually, see [Manual Setup](#manual-setup-advanced) below.

## Manual Setup (Advanced)

### 1. Clone and install

```bash
git clone https://github.com/gadig17/clockwise-alt.git clockwise-alt
cd clockwise-alt
npm install
```

### 2. Authenticate clasp

Log in with your **work** Google account:

```bash
npx clasp login
```

### 3. Create the Apps Script project

```bash
npx clasp create --type standalone --title "clockwise-alt"
```

This generates a `.clasp.json` file (gitignored) that binds your local code to the Apps Script project.

### 4. Enable the Calendar Advanced Service

1. Run `npx clasp open` to open the script in the Apps Script editor
2. In the editor, go to **Services** (the `+` icon on the left)
3. Find **Google Calendar API** and click **Add**
4. Make sure the identifier is `Calendar`

### 5. Share your personal calendar with your work account

1. Open [Google Calendar](https://calendar.google.com/) in your **personal** account
2. Go to **Settings** (gear icon) → find your personal calendar in the left sidebar
3. Under **Share with specific people**, click **Add people**
4. Enter your **work** email address
5. Set permission to **See all event details**
6. Click **Send**
7. On your **work** account, accept the sharing invitation (check email or Calendar settings)

### 6. Set Script Properties

In the Apps Script editor: **Project Settings** → **Script Properties** → **Add script property**

| Property | Example | Required |
|---|---|---|
| `PERSONAL_CALENDAR_ID` | `you@gmail.com` | Yes |
| `WORK_CALENDAR_ID` | `primary` | No (default: `primary`) |
| `TIMEZONE` | `America/New_York` | No (default: `America/New_York`) |
| `WORK_HOURS_START` | `09:00` | No (default: `09:00`) |
| `WORK_HOURS_END` | `17:00` | No (default: `17:00`) |
| `WORK_DAYS` | `1,2,3,4,5` | No (default: `1,2,3,4,5`) |
| `LUNCH_WINDOW_START` | `11:30` | No (default: `11:30`) |
| `LUNCH_WINDOW_END` | `13:30` | No (default: `13:30`) |
| `LUNCH_PREFERRED_START` | `12:00` | No (default: `12:00`) |
| `LUNCH_MAX_MINUTES` | `60` | No (default: `60`) |
| `LUNCH_MIN_MINUTES` | `30` | No (default: `30`) |
| `SYNC_LOOKAHEAD_DAYS` | `14` | No (default: `14`) |
| `SYNC_OUTSIDE_WORK_HOURS` | `true` | No (default: `false`) |
| `BUSY_BLOCK_TITLE` | `Busy (Synced)` | No (default: `Busy (Synced)`) |

See `.env.example` for a full reference.

### 7. Push code

```bash
npx clasp push
```

### 8. Verify setup

Open the Apps Script editor if it's not already open:

```bash
npx clasp open
```

In the left sidebar, click **`main`**, then select **`healthCheck`** from the function dropdown and click **Run** (▶). The first time you run any function, Google will ask you to **review permissions** — click through to allow the script access to your work calendar. Check the Execution log — it should show OK for config and both calendars.

### 9. Install triggers

With **`main`** still open, select **`installTriggers`** from the function dropdown and click **Run** (▶). This creates:

- `syncPersonalToWork` — every 5 minutes
- `scheduleLunch` — daily at 7 AM + every 15 minutes

### 13. Verify

Check your work calendar. Within a few minutes you should see:

- "Busy (Synced)" blocks mirroring your personal events
- A "Lunch" block in your configured window

## Manual functions

Run these from the Apps Script editor for testing and troubleshooting:

| Function | Purpose |
|---|---|
| `healthCheck` | Verify config and calendar access |
| `applySetupPayload` | Bulk-set properties from SETUP_PAYLOAD JSON (used by setup wizard) |
| `showConfig` | Print current configuration |
| `runSyncNow` | Run a one-time personal → work sync |
| `runLunchNow` | Run a one-time lunch scheduling |
| `installTriggers` | Set up all time-driven triggers |
| `removeTriggers` | Remove all project triggers |

## Security

- **No tokens or secrets** — personal calendar access uses Google Calendar sharing, not OAuth tokens
- **Private busy blocks** — synced events are marked with `visibility: private`
- **Per-user deployment** — each user deploys their own Apps Script project
- **`.clasp.json` gitignored** — script IDs are per-user

## Project structure

```
clockwise-alt/
  src/
    main.ts           Trigger entry points, manual functions, health check
    sync.ts           Personal → work calendar sync logic
    lunch.ts          Lunch auto-scheduling with rescheduling
    config.ts         Script Properties reader with validation
    calendar.ts       Calendar API helpers (read, create, update, delete)
  setup.mjs           Interactive CLI setup wizard (npm run setup)
  appsscript.json     Apps Script manifest (scopes, libraries)
  .env.example        Documents all Script Properties
  package.json        Dev dependencies (clasp, TypeScript types)
  tsconfig.json       TypeScript configuration
```

## Updating

After making code changes:

```bash
npx clasp push
```

To watch for changes during development:

```bash
npm run watch
```

## Uninstalling

1. Run `removeTriggers` in the Apps Script editor to stop all automation
2. Manually delete any remaining "Busy (Synced)" or "Lunch" events from your work calendar
3. Optionally remove the calendar sharing (personal calendar Settings → Share with specific people → remove your work email)
4. Delete the Apps Script project if desired

## License

MIT
