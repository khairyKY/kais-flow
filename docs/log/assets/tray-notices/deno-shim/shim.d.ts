declare namespace Deno {
  const env: { get(name: string): string | undefined }
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
declare module 'jsr:@negrel/webpush@0.5.0' {
  export class PushMessageError extends Error { response: Response }
  export interface ApplicationServer { subscribe(s: { endpoint: string; keys: { p256dh: string; auth: string } }): { pushTextMessage(m: string, o: object): Promise<void> } }
  export const ApplicationServer: { new (o: object): ApplicationServer } & { new: (o: object) => Promise<ApplicationServer> }
  export function importVapidKeys(k: unknown, o: object): Promise<unknown>
}
