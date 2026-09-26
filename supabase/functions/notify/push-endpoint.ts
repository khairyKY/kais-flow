// SEC-2 (notify SSRF, LOW): `push_subscriptions.endpoint` is whatever the client stored, and notify
// POSTs to it — so without this check `{kind:'test'}` made the edge runtime POST to any URL a user
// chose (internal hosts, metadata services, anyone's server). notify only sends to the Web Push
// services browsers actually hand out; anything else is skipped and counted.
//
// Same rule as the `push_subscriptions_endpoint_known_service` check constraint in migration 0036
// — keep the two in step.
//   Chrome and most Chromium browsers:  fcm.googleapis.com
//   Firefox:                            updates.push.services.mozilla.com
//   Safari (macOS 13+, iOS 16.4+):      *.push.apple.com      (web.push.apple.com today)
//   Microsoft Edge (WNS):               *.notify.windows.com

const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com'])
// One or more DNS labels, then the service's suffix. Anchored at both ends, so
// `push.apple.com.evil.example` and `evilpush.apple.com` fail, and the bare suffix needs a label.
const WILDCARD_HOSTS = [
  /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+push\.apple\.com$/,
  /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+notify\.windows\.com$/,
]

export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  // https on the default port only, and no credentials smuggled in front of the host.
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  const host = url.hostname // already lowercased and IDNA-normalised by the URL parser
  return EXACT_HOSTS.has(host) || WILDCARD_HOSTS.some((re) => re.test(host))
}

/** The host for logs — never the full endpoint, whose path is a per-device capability token. */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return '(unparseable)'
  }
}
