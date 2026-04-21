# Privacy Policy

**clockwise-alt** — Last updated: April 21, 2026

## Overview

clockwise-alt is a personal-use Google Apps Script that syncs calendar events between a personal Google Calendar and a work Google Calendar. It is not a public service and is not intended for use by anyone other than the project owner.

## Data accessed

- **Personal Google Calendar** — Read-only access (`calendar.readonly` scope) to retrieve event times. Event titles and details are never copied; only start/end times are used to create "Busy" blocks.
- **Work Google Calendar** — Read/write access to create, update, and delete "Busy (Synced)" and "Lunch" events managed by this script.

## Data storage

- OAuth tokens are stored in Google Apps Script's Script Properties, which are encrypted at rest by Google.
- No data is stored outside of Google's infrastructure.
- No data is sent to third-party services, analytics providers, or external servers.

## Data sharing

No data is shared with any third party, ever.

## Data retention

Calendar events created by this script can be removed at any time by running the `removeTriggers` function and deleting the managed events. Revoking authorization (`revokeAuthorization`) deletes all stored tokens.

## Contact

This is a personal project. For questions, open an issue at https://github.com/gadig17/clockwise-alt.
