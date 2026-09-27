---
date: 2026-09-27
session: local (laptop, bypass)
type: decision
related: P6 step 7 (capture from anywhere), commit eb579fb
---

# Security review of the capture endpoint: accepted, one finding declined with reasons

An independent reviewer read `eb579fb`. It confirmed as sound:
- no cross-tenant read or write (the owner comes only from the key-hash lookup);
- unsalted SHA-256 of a 256-bit random key is the standard API-key pattern;
- the upsert can't spoof `user_id` (column default + RLS `with check`);
- `payload->>source` filter syntax;
- zod v4 `.trim().url()`;
- wildcard CORS (bearer-only, no cookies);
- `verify_jwt = false` honoured on deploy;
- stable error codes, nothing leaked.

**Declined — "high: an invalid-key flood can burn edge-function invocations":**
- The same holds for every function today. The public anon key lets anyone invoke `verify_jwt = true` functions too, and each such call then costs an `auth.getUser` round-trip.
- A per-IP counter table would add a DB write per request, more than the single unique-index `key_hash` lookup it would guard.
- The real fix is an edge rate-limiter in front of Supabase, which the free tier doesn't offer.
- Revisit if invocation usage in the Supabase dashboard ever climbs toward the 500k/month cap.

**Applied:** a `ponytail:` comment in `captureKey.ts`. It notes the bookmarklet splices the key unescaped, which is safe only because of the base64url alphabet.
