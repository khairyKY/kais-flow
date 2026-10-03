# Capture from anywhere

Everything below lands in your **Inbox**, the same as a ⌘K capture. All of it is $0 and needs nothing
from a third-party account.

| From | How | Setup |
|---|---|---|
| Any Android app | Share → **Kai's Flow** (the APK or the installed web app) | none |
| iPhone / iPad | an "Add to Kai's Flow" shortcut | 2 min, below |
| Android automations | HTTP Shortcuts or Tasker | 2 min, below |
| A desktop browser | the bookmarklet | 1 min, below |
| Scripts, terminals | `curl` / PowerShell | none |

Sharing needs you signed in to the app: a share made while signed out goes to the sign-in page and is
not kept. Images aren't taken yet (they arrive with Paper capture); share text or a link.

## The capture endpoint

Everything except the share sheet talks to one endpoint (`supabase/functions/capture`) with your
personal **capture key**.

- **Address**: `https://<project>.supabase.co/functions/v1/capture`. Settings has the exact address:
  open the capture card's **How to send things here** and press **Copy address**.
- **Key**: Settings → **External capture endpoint** → **Create key** (on the desktop it's under
  Settings → Integrations; on the phone it's on the Settings page itself). The key looks like
  `kf_` + 43 characters and is shown **once**. Copy it then. Only its SHA-256 is stored.
  **New key** replaces it (the old one stops working) and **Turn off** deletes it.
- **Request**: `POST`, headers `Authorization: Bearer kf_…` and `Content-Type: application/json`,
  body `{"text": "…", "url": "https://…"}`. `text` is required (1–4000 characters). `url` is
  optional (≤ 2000) and is added under the text unless the text already contains it.
- **The key goes in the `Authorization` header only, never in the address.** Addresses end up in
  logs, browser history and screenshots.
- **Answers**: `201 {"ok": true, "id": "…"}`. Errors: `400 bad_request` (the body isn't the JSON
  above), `401 capture_key_required` (no key, or not a `kf_…` key), `401 capture_key_invalid`
  (unknown, replaced or turned-off key), `429 daily_limit` (more than **200 captures in 24 hours**),
  `500 capture_failed`.

### Optional: let the AI file it (`?file=1`)

Add `?file=1` to the address (`…/functions/v1/capture?file=1`) and the capture is queued for the AI
instead of waiting as a plain note. The next time the app is open and signed in on any of your
devices, it reads the line **as of when you sent it**. A confident task such as "dentist friday 3pm"
becomes a task with its date; anything else stays in the Inbox with the AI's read attached, ready to
triage. Each one uses one of that day's AI parses (100 a day per person). Without `?file=1` nothing
touches the AI.

## iPhone / iPad: Shortcuts

1. **Shortcuts** → **+** → name it **Add to Kai's Flow**.
2. Tap **ⓘ** (Details) → turn on **Show in Share Sheet**. In the first block set the input to
   **Text** and **URLs**, and **If there's no input: Ask For → Text** (prompt: "What's on your mind?").
3. Add **Get Contents of URL**:
   - URL: your address (add `?file=1` if you want AI filing)
   - Show More → **Method**: `POST`
   - **Headers** → Add new header: key `Authorization`, value `Bearer kf_…` (your key)
   - **Request Body**: `JSON` → Add new field → **Text**: key `text`, value **Shortcut Input**
4. Optional: add **Show Notification** with "Sent ✿".

Run it from the share sheet (Safari, Notes, Messages…), the home screen, Siri ("Add to Kai's Flow"),
Back Tap or the Action button. From Safari, the Shortcut Input is the page's link.

## Android: HTTP Shortcuts or Tasker

The Kai's Flow app is already in the share sheet. These two are for a home-screen button, a voice
command or a Tasker profile.

**HTTP Shortcuts** (free and open source, on F-Droid and Google Play):

1. **+** → **Regular Shortcut** → name it **Kai's Flow**.
2. Variables (the `{}` icon) → **+** → **Text Input**, named `note` (the title is the question
   it asks).
3. **Basic Request Settings**: Method `POST`, URL = your address.
4. **Request Headers**: `Authorization` = `Bearer kf_…`.
5. **Request Body / Parameters**: **Custom Text**, content type `application/json`, body
   `{"text": "{{note}}"}`. Insert `{{note}}` with the variable button, not by typing it.
6. Place it on the home screen. Tapping it asks for the note and sends it.

A `"` or `\` typed into the note breaks the JSON (the endpoint answers 400). If your version of HTTP
Shortcuts can JSON-encode a variable, turn that on and write the body as `{"text": {{note}}}`.

**Tasker**: a task with **Input → Get Voice** (or **Variable Query**) into `%note`, then
**Net → HTTP Request**:

- Method `POST`, URL = your address
- Headers (one per line): `Authorization:Bearer kf_…` and `Content-Type:application/json`
- Body: `{"text":"%note"}`

The same note about `"` applies.

## Desktop browser: the bookmarklet

1. Settings → capture card → **Create key** (or **New key**) → **Copy bookmarklet**. It is only
   offered right after a key is made, because it carries the key.
2. Make a new bookmark and paste what you copied as its **address** (URL).
3. On any page, click it. It sends the selected text, or else the page's title, plus the page's
   address. An alert says whether it arrived.

The key sits inside the bookmarklet's code, not in any web address. The request still carries it in
the header. A site with a strict Content-Security-Policy (`connect-src`) blocks the request; nothing
arrives and no alert shows. Use the share sheet or curl there.

## curl / PowerShell

```sh
curl -X POST https://<project>.supabase.co/functions/v1/capture \
  -H "Authorization: Bearer kf_…" \
  -H "Content-Type: application/json" \
  -d '{"text": "call the tyre supplier"}'
```

```powershell
Invoke-RestMethod -Method Post -Uri 'https://<project>.supabase.co/functions/v1/capture' `
  -Headers @{ Authorization = 'Bearer kf_…' } -ContentType 'application/json' `
  -Body '{"text": "call the tyre supplier"}'
```

## Safety

- A leaked key can only add notes to your own Inbox, at most 200 a day. Press **New key** to cut
  it off.
- The endpoint allows any origin (the bookmarklet runs on any site). That's safe because nothing
  rides on cookies: a caller must hold the key.
- Captures carry `payload.source = "capture"` (plus `url` when given), and `?file=1` ones carry
  `needs_parse` until the app files them.
