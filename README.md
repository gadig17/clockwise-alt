# clockwise-alt

Personal calendar automation via Google Apps Script. Replaces two features from the now-defunct Clockwise:

1. **Personal → Work sync** — Mirrors personal Google Calendar events as "Busy" blocks on your work calendar. Excludes weekends and all-day events. Stays in sync: moved or deleted personal events are reflected automatically.

2. **Auto-schedule lunch** — Finds a free slot within your preferred lunch window each day and blocks it off. Automatically reschedules if a meeting gets booked over it.

## How it works

- A Google Apps Script runs on your **work** Google account
- It reads your **personal** Google Calendar via OAuth2 (read-only — it never writes to your personal calendar)
- It creates/updates/deletes events on your work calendar using the Calendar Advanced Service
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

### 5. Create a Google Cloud project and OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Calendar API**:
   - APIs & Services → Library → Search "Google Calendar API" → Enable
4. Configure **Branding** (in the left sidebar: **Google Auth Platform** → **Branding**):
   - Set **App name** to `clockwise-alt`
   - Set **User support email** to your email
   - Save
5. Configure **Audience** (sidebar → **Audience**):
   - Set the user type to **External** (or **Internal** if your personal account is on the same Workspace org)
   - Under **Test users**, click **Add users**
   - Enter your **personal** Google email (e.g. `you@gmail.com`) and save
6. Configure **Data Access** (sidebar → **Data Access**):
   - Click **Add or Remove Scopes**
   - Search for or paste `https://www.googleapis.com/auth/calendar.readonly`
   - Check it and click **Update**, then **Save**
7. Create **OAuth credentials** (sidebar → **Clients**):
   - Click **Create Client**
   - Application type: **Web application**
   - Name: `clockwise-alt`
   - Under **Authorized redirect URIs**, click **Add URI** and enter: `http://localhost`
   - Click **Create** and save the **Client ID** and **Client Secret**

### 6. Link the GCP project to Apps Script

1. In the Apps Script editor, go to **Project Settings** (gear icon)
2. Under **Google Cloud Platform (GCP) Project**, click **Change project**
3. Enter the GCP project number (found in GCP → Dashboard → Project info)

### 7. Set Script Properties

In the Apps Script editor: **Project Settings** → **Script Properties** → **Add script property**

| Property | Example | Required |
|---|---|---|
| `OAUTH_CLIENT_ID` | `123...apps.googleusercontent.com` | Yes |
| `OAUTH_CLIENT_SECRET` | `GOCSPX-...` | Yes |
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

### 8. Push code

```bash
npx clasp push
```

### 9. Authorize personal calendar

**Important:** The function dropdown (to the left of the ▶ Run button) only shows functions from the **currently open file**. Select the correct file in the left sidebar first.

Open the Apps Script editor if it's not already open:

```bash
npx clasp open
```

**Step 1 — Get the authorization URL:**

1. In the left sidebar under **Files**, click **`oauth`** to open it
2. In the toolbar, click the **function dropdown** (to the left of the ▶ button) and select **`authorize`**
3. Click **Run** (▶)
4. The first time you run any function, Google will ask you to **review permissions** — click through to allow the script access to your work calendar
5. Check the **Execution log** at the bottom — copy the authorization URL

**Step 2 — Approve and copy the code:**

6. Open the URL in any browser
7. Sign in with your **personal** Google account and grant read-only calendar access
8. The browser will redirect to `http://localhost?code=...` — the page **won't load** (that's expected!)
9. Look at the **address bar**. The URL looks like: `http://localhost?code=4/0AXX...&scope=...`
10. Copy the `code` value — everything between `code=` and `&scope`

**Step 3 — Exchange the code for tokens:**

11. In the Apps Script editor, go to **Project Settings** → **Script Properties**
12. Add a new property: **`AUTH_CODE`** = the code you just copied
13. Go back to the editor, open **`oauth`**, select **`exchangeToken`** from the function dropdown
14. Click **Run** (▶)
15. The Execution log should say "Authorization successful!"

### 11. Verify setup

In the left sidebar, click **`main`**, then select **`healthCheck`** from the function dropdown and click **Run** (▶). Check the Execution log at the bottom — it should show OK for config, OAuth, and both calendars.

### 12. Install triggers

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
| `authorize` | Get the OAuth authorization URL (step 1) |
| `exchangeToken` | Exchange the AUTH_CODE for tokens (step 2) |
| `revokeAuthorization` | Revoke personal calendar token |
| `healthCheck` | Verify config, auth, and calendar access |
| `applySetupPayload` | Bulk-set properties from SETUP_PAYLOAD JSON (used by setup wizard) |
| `showConfig` | Print current configuration |
| `runSyncNow` | Run a one-time personal → work sync |
| `runLunchNow` | Run a one-time lunch scheduling |
| `installTriggers` | Set up all time-driven triggers |
| `removeTriggers` | Remove all project triggers |

## Security

- **No hardcoded secrets** — OAuth client ID/secret stored in Script Properties
- **Minimal scopes** — personal calendar is accessed with `calendar.readonly`
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
    oauth.ts          OAuth2 service for personal calendar access
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
3. Run `revokeAuthorization` to revoke the personal calendar token
4. Delete the Apps Script project if desired

## License

MIT
