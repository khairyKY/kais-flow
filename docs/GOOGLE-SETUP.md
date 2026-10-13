# Google Calendar sync — setup for Kai

Kai's Flow can show your Google calendars (your prayer times, work, holidays) on its own calendar. It only reads them: nothing is ever written back to Google. Every step below is **free**: no billing account and no card.

You do steps 1–6 once, in a browser and a terminal. Step 7 is in the app. It takes about 10 minutes.

**The exact values (decided 2026-10-13):**

| What | Value |
|---|---|
| Redirect URI | `https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/google-connect` |
| Scope | `https://www.googleapis.com/auth/calendar.readonly` (read-only) |
| Secret names | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Where the browser lands after Google | `https://kais-flow.kaidagoat.workers.dev/settings?google=connected` (or `?google=error&reason=…`) |

---

## 1. A Google Cloud project `[KAI]`

1. Go to <https://console.cloud.google.com/> and sign in with the Google account whose calendars you want to see.
2. Open the project picker at the top, choose **New project**, and name it `Kais Flow`. Leave the organisation as "No organisation". Click **Create**, then make sure the new project is the one selected at the top.

No billing account is needed: the Calendar API costs nothing at this size.

## 2. Turn on the Google Calendar API `[KAI]`

1. Open **APIs & Services → Library**.
2. Search for **Google Calendar API**, open it, and click **Enable**.

## 3. The consent screen `[KAI]`

Google calls this part the **Google Auth Platform** (APIs & Services → OAuth consent screen). If it asks, click **Get started**.

1. **Branding:**
   - App name: `Kai's Flow`.
   - User support email: your Gmail.
   - Developer contact email: your Gmail.
   - Leave the logo and the links empty. A logo would start Google's verification.
2. **Audience:** User type **External** (a personal Gmail account can't choose Internal).
3. **Data Access → Add or remove scopes:** paste `https://www.googleapis.com/auth/calendar.readonly` into "Manually add scopes", click **Add to table**, then **Update**, then **Save**. Google lists it as a *sensitive* scope. That is expected.

### Testing or In production? Pick **In production**.

You'll see a **Publishing status** on the Audience page. What each one means for you, from Google's own help pages (checked 2026-10-13):

- **Testing:** only the test users you list can connect (up to 100). Google's words: *"Authorizations by a test user will expire seven days from the time of consent"*, and the refresh token expires with them. Kai's Flow would show **"Access expired — reconnect"** every week. Fine for a first try, bad for daily use.
- **In production, not verified:** anyone with a Google account could connect, and Google shows an **"Google hasn't verified this app"** warning on the consent page. Google's help says an app *"for your personal use (fewer than 100 users)"* can keep running *"without going through verification"*. The people using it click through the warning. Google also caps an unverified app at 100 new users over its lifetime, which doesn't matter for one person. The 7-day expiry doesn't apply here.

So: on **Audience**, click **Publish app** and confirm. Don't submit anything for verification.

In production, a refresh token still stops working if:
- you remove Kai's Flow at <https://myaccount.google.com/permissions>;
- it isn't used for 6 months (the 15-minute sync uses it all the time);
- the same account authorises the same client more than 100 times (the oldest token is dropped).

Settings then says "Access expired — reconnect". Reconnecting fixes it.

## 4. The OAuth client `[KAI]`

1. Open **Clients** (Google Auth Platform → Clients, or APIs & Services → Credentials), then **Create client**.
2. **Application type:** **Web application**. **Name:** `Kai's Flow (Supabase)`.
3. **Authorized JavaScript origins:** leave empty.
4. **Authorized redirect URIs → Add URI**, then paste this exactly (no trailing slash):

   ```
   https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/google-connect
   ```

5. Click **Create**. Copy the **Client ID** (`…apps.googleusercontent.com`) and the **Client secret** (`GOCSPX-…`).

   The secret is a password. Don't put it in the repo, the vault, a chat, or any `VITE_` variable. It goes to one place: step 5.

Google says a redirect URI change can take from 5 minutes to a few hours to work.

## 5. Give the secrets to Supabase `[KAI]`

From `D:\Coding\kais-flow`, in a terminal:

```
supabase secrets set GOOGLE_CLIENT_ID=<the client id> GOOGLE_CLIENT_SECRET=<the client secret> --project-ref eqbbkitofgyxxrfggpbu
```

They live only in the edge functions' secrets. The app never sees them.

## 6. Deploy (once, or let the release do it)

The next release runs this for you (`.github/workflows/release.yml`: `db push`, then every function in `FUNCTIONS`, google-connect and google-sync included). By hand, in this order:

```
supabase db push                                   # 0074: the 15-minute google-sync cron + an index
supabase functions deploy google-connect --project-ref eqbbkitofgyxxrfggpbu
supabase functions deploy google-sync --project-ref eqbbkitofgyxxrfggpbu
```

google-connect deploys with `verify_jwt = false` (set in `supabase/config.toml`), because Google's redirect back carries no login. The function checks the login itself: it reads your session on Connect, and on the way back it checks the signed, 10-minute `state` (HMAC with the client secret). The Settings change ships with the app as usual.

## 7. Connect, in the app

1. **Settings → Integrations → Google Calendar → Connect** (on the phone: Settings → Connections).
2. Google's consent page opens. It's the only Google screen you'll see:
   - choose your account;
   - on "Google hasn't verified this app", click **Advanced → Go to Kai's Flow (unsafe)**;
   - leave **"See and download any calendar you can access using your Google Calendar"** ticked;
   - click **Continue**.
3. You land back on Settings, which says **"Connected · Synced · …"**.
4. Under **Calendars**, switch on what you want on the grid. The calendars you already show in Google Calendar start switched on. Turn on your prayer-times calendar if it's off. Each switch saves at once, and a calendar you hide takes its events off the grid.

From then on, google-sync reads the chosen calendars **every 15 minutes**. It reads from a week ago to 60 days ahead, on your clock. **Sync now** reads them at once.

On the grid, Google events look like normal events, in their calendar's colour. You can't drag, resize or delete them. Click one and it says **"From Google · <calendar name>"**. They count as busy for free time and overlaps.

## If something goes wrong

| You see | Why | Fix |
|---|---|---|
| "Not set up yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET aren't set on the server" | Step 5 isn't done. | Do step 5. |
| "Google Calendar isn't on the server yet" | The functions aren't deployed. | Do step 6. |
| Google says `redirect_uri_mismatch` | The URI in step 4 isn't exactly the one above, or the change hasn't spread yet. | Fix it, wait a few minutes, connect again. |
| "Access expired — reconnect" | The publishing status is Testing (7 days), or access was removed at Google. | Publish the app (step 3), then Reconnect. |
| "leave the calendar box ticked on Google's page" | The calendar box on the consent page was unticked. | Connect again and leave it ticked. |
| "Google didn't give lasting access" | Rare: Google sent no refresh token. | Remove Kai's Flow at <https://myaccount.google.com/permissions>, then Connect again. |

**Disconnect** (in Settings) revokes the access at Google and removes every synced event from Kai's Flow. Your own events aren't touched.

## Not built yet (follow-up)

Our blocks going out to Google as "busy" (Akiflow's two-way sync). It needs the `calendar.events` scope and a writer, and Kai decided on read-only for now (2026-10-13).
