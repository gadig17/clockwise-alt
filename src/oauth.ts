/**
 * Manual OAuth2 flow for personal Google Calendar access.
 *
 * Uses http://localhost as the redirect URI. After the user approves,
 * Google redirects to localhost (which won't load), but the authorization
 * code is visible in the browser address bar. The user copies it into
 * a Script Property, then runs exchangeToken() to complete the flow.
 */

const PERSONAL_TOKEN_KEY = "PERSONAL_CAL_TOKEN";
const REDIRECT_URI = "http://localhost";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ── Authorization flow ───────────────────────────────────────────────

/**
 * Step 1: Run this from the script editor to get the authorization URL.
 */
function authorize(): void {
  const token = getStoredToken();
  if (token && token.refresh_token) {
    Logger.log(
      "Already authorized. Run revokeAuthorization() first to re-authorize."
    );
    return;
  }

  const config = getConfig();
  const params: Record<string, string> = {
    client_id: config.oauthClientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;

  Logger.log("=== STEP 1 of 2: Authorize ===");
  Logger.log("Open this URL in any browser:\n%s", url);
  Logger.log(
    "\nAfter you approve, the browser will redirect to a page that " +
      "won't load (http://localhost). That's expected!"
  );
  Logger.log(
    "Look at the ADDRESS BAR and copy the 'code' value from the URL.\n" +
      "The URL will look like: http://localhost?code=4/0XXXXX...&scope=...\n" +
      "Copy everything between 'code=' and '&scope'."
  );
  Logger.log(
    "\n=== STEP 2 of 2: Exchange the code ===\n" +
      "Go to Project Settings > Script Properties and set:\n" +
      "  AUTH_CODE = (paste the code you copied)\n" +
      "Then come back and run exchangeToken()"
  );
}

/**
 * Step 2: After pasting the code into AUTH_CODE Script Property, run this.
 */
function exchangeToken(): void {
  const props = PropertiesService.getScriptProperties();
  const code = props.getProperty("AUTH_CODE");
  if (!code) {
    Logger.log(
      "No AUTH_CODE found in Script Properties.\n" +
        "Run authorize() first, then paste the code into a Script Property called AUTH_CODE."
    );
    return;
  }

  const config = getConfig();

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      code: code,
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    },
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  if (result.error) {
    Logger.log(
      "Token exchange failed: %s — %s",
      result.error,
      result.error_description
    );
    Logger.log("Try running authorize() again to get a fresh code.");
    // Clear the stale code
    props.deleteProperty("AUTH_CODE");
    return;
  }

  const tokenData: TokenData = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Date.now() + result.expires_in * 1000,
  };

  props.setProperty(PERSONAL_TOKEN_KEY, JSON.stringify(tokenData));
  props.deleteProperty("AUTH_CODE");

  Logger.log("Authorization successful! Personal calendar tokens stored.");
  Logger.log("You can now run healthCheck() to verify everything works.");
}

// ── Token management ─────────────────────────────────────────────────

function getPersonalAccessToken(): string {
  const token = getStoredToken();
  if (!token || !token.refresh_token) {
    throw new Error("Personal calendar not authorized. Run authorize() first.");
  }

  // Return cached token if still valid (with 60s buffer)
  if (Date.now() < token.expires_at - 60000) {
    return token.access_token;
  }

  // Refresh the token
  const config = getConfig();
  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    },
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  if (result.error) {
    throw new Error(
      "Token refresh failed (" + result.error + "): " + result.error_description
    );
  }

  token.access_token = result.access_token;
  token.expires_at = Date.now() + result.expires_in * 1000;

  PropertiesService.getScriptProperties().setProperty(
    PERSONAL_TOKEN_KEY,
    JSON.stringify(token)
  );

  return token.access_token;
}

function getStoredToken(): TokenData | null {
  const raw =
    PropertiesService.getScriptProperties().getProperty(PERSONAL_TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as TokenData;
}

function isPersonalCalendarAuthorized(): boolean {
  const token = getStoredToken();
  return token !== null && !!token.refresh_token;
}

/**
 * Revoke the stored personal calendar token.
 */
function revokeAuthorization(): void {
  PropertiesService.getScriptProperties().deleteProperty(PERSONAL_TOKEN_KEY);
  Logger.log("Personal calendar authorization revoked.");
}

// ── API requests ─────────────────────────────────────────────────────

/**
 * Make an authenticated GET request to the personal Google Calendar API.
 */
function fetchPersonalCalendarApi(
  path: string,
  params?: Record<string, string>
): unknown {
  const accessToken = getPersonalAccessToken();

  let url = `https://www.googleapis.com/calendar/v3${path}`;
  if (params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    url += `?${qs}`;
  }

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(
      "Calendar API error (" + code + "): " + response.getContentText()
    );
  }
  return JSON.parse(response.getContentText());
}
