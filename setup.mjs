#!/usr/bin/env node

/**
 * Interactive CLI wizard for setting up clockwise-alt.
 * Uses only Node.js built-ins — no extra dependencies.
 *
 * Usage: npm run setup
 */

import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { platform } from "node:os";

// ── Helpers ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question, defaultVal) {
  const suffix = defaultVal != null ? ` [${defaultVal}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || (defaultVal ?? ""));
    });
  });
}

function promptRequired(question) {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(`${question}: `, (answer) => {
        if (answer.trim()) {
          resolve(answer.trim());
        } else {
          console.log("  This field is required.");
          ask();
        }
      });
    };
    ask();
  });
}

function promptSecret(question) {
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      if (answer.trim()) {
        resolve(answer.trim());
      } else {
        console.log("  This field is required.");
        resolve(promptSecret(question));
      }
    });
  });
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", stdio: "inherit", ...opts });
}

function runCapture(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const plat = platform();
  try {
    if (plat === "darwin") execSync(`open "${url}"`, { stdio: "pipe" });
    else if (plat === "win32") execSync(`start "" "${url}"`, { stdio: "pipe" });
    else execSync(`xdg-open "${url}"`, { stdio: "pipe" });
  } catch {
    // Silently fail — URL is printed anyway
  }
}

function pause(message = "Press Enter to continue...") {
  return new Promise((resolve) => rl.question(message, resolve));
}

function banner(text) {
  const line = "─".repeat(text.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${text}  │`);
  console.log(`└${line}┘\n`);
}

function step(num, text) {
  console.log(`\n  [${ num}] ${text}`);
  console.log(`  ${"─".repeat(text.length + 4)}`);
}

// ── Phase 1: Prerequisites ───────────────────────────────────────────

async function checkPrerequisites() {
  step(1, "Checking prerequisites");

  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  if (major < 18) {
    console.error(`  Node.js >= 18 required (found ${nodeVersion}).`);
    process.exit(1);
  }
  console.log(`  Node.js ${nodeVersion} — OK`);

  if (!existsSync("node_modules")) {
    console.log("  node_modules not found — running npm install...");
    run("npm install");
  }
  console.log("  npm dependencies — OK");

  if (!existsSync("node_modules/.bin/clasp")) {
    console.error(
      '  clasp not found in node_modules. Run "npm install" first.'
    );
    process.exit(1);
  }
  console.log("  clasp CLI — OK");
}

// ── Phase 2: GCP project ────────────────────────────────────────────

async function setupGcpProject() {
  step(2, "Google Cloud project setup");

  const hasGcloud = commandExists("gcloud");

  if (hasGcloud) {
    console.log("  gcloud CLI detected.\n");
    const automate = await prompt(
      "  Create a new GCP project automatically? (y/n)",
      "y"
    );

    if (automate.toLowerCase() === "y") {
      const suffix = Math.random().toString(36).slice(2, 8);
      const defaultId = `clockwise-alt-${suffix}`;
      const projectId = await prompt("  GCP Project ID", defaultId);

      console.log(`\n  Creating project "${projectId}"...`);
      try {
        run(`gcloud projects create ${projectId} --name="clockwise-alt"`, {
          stdio: "pipe",
        });
        console.log("  Project created.");
      } catch (e) {
        console.log(
          "  Project creation failed (it may already exist). Continuing..."
        );
      }

      console.log("  Enabling Google Calendar API...");
      try {
        run(
          `gcloud services enable calendar-json.googleapis.com --project=${projectId}`,
          { stdio: "pipe" }
        );
        console.log("  Calendar API enabled.");
      } catch {
        console.log(
          "  Could not enable API automatically. You'll need to enable it manually."
        );
      }

      const projectNumber = runCapture(
        `gcloud projects describe ${projectId} --format="value(projectNumber)"`
      );
      if (projectNumber) {
        console.log(`\n  Project Number: ${projectNumber}`);
        console.log(
          "  (You'll need this to link the GCP project to Apps Script)"
        );
      }

      console.log(
        `\n  GCP Console URL:\n  https://console.cloud.google.com/apis/dashboard?project=${projectId}`
      );

      printOAuthInstructions(projectId);
      await pause("\n  Press Enter once you have the Client ID and Secret ready...");
      return { projectId, projectNumber };
    }
  } else {
    console.log("  gcloud CLI not found (optional — install via:");
    console.log("    brew install --cask google-cloud-sdk");
    console.log("  to automate GCP setup next time).\n");
  }

  printManualGcpInstructions();
  await pause(
    "\n  Press Enter once you have the Client ID and Secret ready..."
  );
  return {};
}

function printOAuthInstructions(projectId) {
  const baseUrl = projectId
    ? `https://console.cloud.google.com/auth?project=${projectId}`
    : "https://console.cloud.google.com/auth";

  console.log(`
  Now create OAuth credentials in the GCP console.
  Open: ${baseUrl}

  1. Branding (left sidebar):
     - App name: clockwise-alt
     - User support email: your email
     - Save

  2. Audience (left sidebar):
     - User type: External
     - Add your personal email as a test user
     - Save

  3. Data Access (left sidebar):
     - Add scope: https://www.googleapis.com/auth/calendar.readonly
     - Save

  4. Clients (left sidebar):
     - Create Client
     - Type: Web application
     - Name: clockwise-alt
     - Authorized redirect URI: http://localhost
     - Create — save the Client ID and Client Secret`);
}

function printManualGcpInstructions() {
  console.log(`
  You need a Google Cloud project with OAuth credentials.

  1. Go to: https://console.cloud.google.com/
  2. Create a new project (or select existing)
  3. Enable the Google Calendar API:
     APIs & Services > Library > search "Google Calendar API" > Enable
  4. Go to Google Auth Platform (left sidebar):

     a. Branding:
        - App name: clockwise-alt
        - User support email: your email
        - Save

     b. Audience:
        - User type: External
        - Add your personal email as a test user
        - Save

     c. Data Access:
        - Add scope: https://www.googleapis.com/auth/calendar.readonly
        - Save

     d. Clients:
        - Create Client
        - Type: Web application
        - Name: clockwise-alt
        - Authorized redirect URI: http://localhost
        - Create — save the Client ID and Client Secret`);
}

// ── Phase 3: Apps Script project ─────────────────────────────────────

async function setupAppsScript() {
  step(3, "Apps Script project");

  const alreadyCreated = existsSync(".clasp.json");

  if (alreadyCreated) {
    console.log("  .clasp.json found — project already linked.");
    const recreate = await prompt(
      "  Re-create the project? (y/n)",
      "n"
    );
    if (recreate.toLowerCase() !== "y") {
      console.log("  Pushing latest code...");
      run("npx clasp push --force");
      return;
    }
  }

  console.log("\n  Logging in to clasp (this will open your browser).");
  console.log("  Sign in with your WORK Google account.\n");
  await pause("  Press Enter to open the browser...");
  run("npx clasp login");

  console.log("\n  Creating Apps Script project...");
  run('npx clasp create --type standalone --title "clockwise-alt"');

  console.log("  Pushing code...");
  run("npx clasp push --force");

  console.log("  Apps Script project created and code pushed.");
}

// ── Phase 4: Configuration prompts ──────────────────────────────────

async function collectConfig() {
  step(4, "Configuration");

  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  console.log("  Enter your settings (press Enter to accept defaults).\n");

  const oauthClientId = await promptRequired("  OAuth Client ID");
  const oauthClientSecret = await promptSecret("  OAuth Client Secret");
  const personalCalendarId = await promptRequired(
    "  Personal calendar email (e.g. you@gmail.com)"
  );

  console.log("");
  const workCalendarId = await prompt(
    "  Work calendar ID",
    "primary"
  );
  const timezone = await prompt("  Timezone (IANA)", systemTz);
  const workHoursStart = await prompt("  Work hours start (HH:MM)", "09:00");
  const workHoursEnd = await prompt("  Work hours end (HH:MM)", "17:00");
  const lunchPreferredStart = await prompt(
    "  Lunch preferred start (HH:MM)",
    "12:00"
  );
  const lunchWindowStart = await prompt(
    "  Lunch window start (HH:MM)",
    "11:30"
  );
  const lunchWindowEnd = await prompt(
    "  Lunch window end (HH:MM)",
    "13:30"
  );
  const lunchMaxMinutes = await prompt("  Lunch max minutes", "60");
  const lunchMinMinutes = await prompt("  Lunch min minutes", "30");

  console.log(
    "\n  (Advanced options like colors and sync-outside-hours can be set"
  );
  console.log("   later in Script Properties.)\n");

  return {
    OAUTH_CLIENT_ID: oauthClientId,
    OAUTH_CLIENT_SECRET: oauthClientSecret,
    PERSONAL_CALENDAR_ID: personalCalendarId,
    WORK_CALENDAR_ID: workCalendarId,
    TIMEZONE: timezone,
    WORK_HOURS_START: workHoursStart,
    WORK_HOURS_END: workHoursEnd,
    WORK_DAYS: "1,2,3,4,5",
    LUNCH_WINDOW_START: lunchWindowStart,
    LUNCH_WINDOW_END: lunchWindowEnd,
    LUNCH_PREFERRED_START: lunchPreferredStart,
    LUNCH_MAX_MINUTES: lunchMaxMinutes,
    LUNCH_MIN_MINUTES: lunchMinMinutes,
    SYNC_LOOKAHEAD_DAYS: "14",
    SYNC_OUTSIDE_WORK_HOURS: "false",
    BUSY_BLOCK_TITLE: "Busy (Synced)",
  };
}

// ── Phase 5: Set Script Properties ──────────────────────────────────

async function setScriptProperties(config) {
  step(5, "Setting Script Properties");

  const payload = JSON.stringify(config);

  console.log(
    "  The setup wizard will set all properties at once via a single"
  );
  console.log("  Script Property.\n");

  console.log("  In the Apps Script editor:\n");
  console.log("  1. Click the gear icon (Project Settings)");
  console.log("  2. Scroll to Script Properties");
  console.log("  3. Click 'Add script property'");
  console.log("  4. Property name:  SETUP_PAYLOAD");
  console.log("     Value:  (paste the JSON below)\n");
  console.log("  ────────── Copy this JSON ──────────");
  console.log(payload);
  console.log("  ────────────────────────────────────\n");
  console.log("  5. Click Save");
  console.log(
    "  6. Go to the Editor, open 'main', select 'applySetupPayload'"
  );
  console.log("     from the function dropdown, and click Run.\n");

  // Try to open the Apps Script editor
  const claspJson = readClaspJson();
  if (claspJson?.scriptId) {
    const editorUrl = `https://script.google.com/d/${claspJson.scriptId}/edit`;
    console.log(`  Opening editor: ${editorUrl}`);
    openBrowser(editorUrl);
  }

  await pause(
    "  Press Enter after you've run applySetupPayload successfully..."
  );
}

// ── Phase 6: OAuth Authorization ─────────────────────────────────────

async function authorizeOAuth(config) {
  step(6, "Personal calendar authorization");

  const params = new URLSearchParams({
    client_id: config.OAUTH_CLIENT_ID,
    redirect_uri: "http://localhost",
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  console.log("  Opening your browser for personal Google account auth...");
  console.log(`\n  URL: ${url}\n`);
  openBrowser(url);

  console.log("  Sign in with your PERSONAL Google account.");
  console.log(
    "  After approving, the browser redirects to http://localhost"
  );
  console.log("  (the page won't load — that's expected).\n");
  console.log("  Look at the ADDRESS BAR. The URL looks like:");
  console.log("    http://localhost?code=4/0AXX...&scope=...");
  console.log("  Copy everything between 'code=' and '&scope'.\n");

  const authCode = await promptRequired("  Paste the authorization code");

  console.log("\n  Now set the AUTH_CODE Script Property:\n");
  console.log("  1. In Apps Script editor: Project Settings > Script Properties");
  console.log(`  2. Add property:  AUTH_CODE  =  ${authCode}`);
  console.log("  3. Save");
  console.log(
    "  4. Go to Editor, open 'oauth', select 'exchangeToken', click Run\n"
  );

  await pause(
    '  Press Enter after exchangeToken shows "Authorization successful"...'
  );
}

// ── Phase 7: Finalize ───────────────────────────────────────────────

async function linkGcpProject(gcpInfo) {
  step("7a", "Link GCP project to Apps Script");

  if (gcpInfo?.projectNumber) {
    console.log(
      `  Your GCP project number is: ${gcpInfo.projectNumber}`
    );
  } else {
    console.log(
      "  Find your GCP project number in: GCP Console > Dashboard > Project info"
    );
  }

  console.log("\n  In the Apps Script editor:");
  console.log("  1. Click the gear icon (Project Settings)");
  console.log(
    '  2. Under "Google Cloud Platform (GCP) Project", click "Change project"'
  );
  console.log("  3. Enter the GCP project number and click Set project\n");

  await pause("  Press Enter once the GCP project is linked...");
}

async function enableCalendarService() {
  step("7b", "Enable Calendar Advanced Service");

  console.log("  The Calendar service should be auto-enabled from appsscript.json.");
  console.log("  If healthCheck later reports 'Calendar is not defined', then:\n");
  console.log("  1. In the Apps Script editor, click Services (+) in the left sidebar");
  console.log("  2. Find 'Google Calendar API' and click Add");
  console.log("  3. Ensure the identifier is 'Calendar'\n");

  await pause("  Press Enter to continue...");
}

async function installTriggersStep() {
  step(8, "Install triggers");

  console.log("  In the Apps Script editor:");
  console.log("  1. Open 'main' from the Files sidebar");
  console.log("  2. Select 'installTriggers' from the function dropdown");
  console.log("  3. Click Run\n");
  console.log("  This creates:");
  console.log("    - syncPersonalToWork — every 5 minutes");
  console.log("    - scheduleLunch — daily at 7 AM + every 15 minutes\n");

  await pause("  Press Enter after triggers are installed...");
}

async function runHealthCheck() {
  step(9, "Health check");

  console.log("  In the Apps Script editor:");
  console.log("  1. Open 'main' from the Files sidebar");
  console.log("  2. Select 'healthCheck' from the function dropdown");
  console.log("  3. Click Run\n");
  console.log("  The Execution log should show OK for:");
  console.log("    - Config");
  console.log("    - Personal calendar OAuth");
  console.log("    - Personal calendar");
  console.log("    - Work calendar");
  console.log("    - Active triggers: 3\n");

  await pause("  Press Enter to finish setup...");
}

function printSummary() {
  const claspJson = readClaspJson();
  const scriptId = claspJson?.scriptId;

  banner("Setup complete!");

  console.log("  Your clockwise-alt is now running. Here's what's active:\n");
  console.log('    - Personal events sync as "Busy (Synced)" every 5 min');
  console.log("    - Lunch auto-scheduled daily at 7 AM + re-checked every 15 min\n");

  if (scriptId) {
    console.log("  Useful links:");
    console.log(
      `    Editor:     https://script.google.com/d/${scriptId}/edit`
    );
    console.log(
      `    Executions: https://script.google.com/d/${scriptId}/executions`
    );
    console.log("");
  }

  console.log("  To change settings:");
  console.log(
    "    Edit Script Properties in the Apps Script editor (gear icon)\n"
  );
  console.log("  To update code:");
  console.log("    npx clasp push\n");
  console.log("  Useful manual functions (run from the editor):");
  console.log("    runSyncNow     — trigger a one-time sync");
  console.log("    runLunchNow    — schedule lunch for today");
  console.log("    runLunchBulk   — schedule lunch for next 14 days");
  console.log("    healthCheck    — verify everything works");
  console.log("    showConfig     — print current configuration");
  console.log("    showColors     — list available event color IDs\n");
}

// ── Utilities ────────────────────────────────────────────────────────

function readClaspJson() {
  try {
    return JSON.parse(readFileSync(".clasp.json", "utf-8"));
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  banner("clockwise-alt Setup Wizard");

  console.log("  This wizard will walk you through the full setup.");
  console.log("  It takes about 10 minutes.\n");

  try {
    await checkPrerequisites();
    const gcpInfo = await setupGcpProject();
    await setupAppsScript();
    await linkGcpProject(gcpInfo);
    await enableCalendarService();
    const config = await collectConfig();
    await setScriptProperties(config);
    await authorizeOAuth(config);
    await installTriggersStep();
    await runHealthCheck();
    printSummary();
  } catch (err) {
    console.error(`\n  Setup failed: ${err.message || err}`);
    console.error("  Fix the issue and re-run: npm run setup\n");
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
