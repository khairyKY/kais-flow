// Prints a fresh, throwaway VAPID key pair (the JSON shape notify's VAPID_KEYS secret uses), so the
// harness never needs — or reads — a real key. Only the mock push service ever sees its pushes.
import * as webpush from 'jsr:@negrel/webpush@^0.5.0' // same major as notify resolves today

const keys = await webpush.generateVapidKeys({ extractable: true })
console.log(JSON.stringify(await webpush.exportVapidKeys(keys)))
