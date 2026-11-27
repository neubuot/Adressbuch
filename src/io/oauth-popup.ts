/**
 * Anmeldung bei einem Kontaktdienst in einem eigenen Fenster.
 *
 * Das Ergebnis reicht die kleine Seite oauth.html zurück: über einen Kanal
 * zwischen Fenstern derselben Adresse (BroadcastChannel), ersatzweise als
 * Nachricht an dieses Fenster. Ob das Anmeldefenster noch offen ist, lässt
 * sich nicht verlässlich feststellen (die Dienste trennen die Verbindung
 * zwischen den Fenstern). Deshalb endet das Warten nur durch Ergebnis,
 * Abbruch über `signal` oder Zeitablauf.
 */

export class ImportAccessError extends Error {
  constructor(
    message: string,
    readonly kind: 'cancelled' | 'blocked' | 'denied' | 'network'
  ) {
    super(message);
  }
}

/** Kanal, über den oauth.html das Ergebnis der Anmeldung zurückreicht */
export const OAUTH_CHANNEL = 'adressbuch-oauth';
const ACCESS_TIMEOUT_MS = 5 * 60 * 1000;

export function randomToken(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Adresse der Seite, die das Ergebnis der Anmeldung zurückreicht */
export function oauthRedirectUri(): string {
  const url = new URL('oauth.html', document.baseURI);
  url.hash = '';
  url.search = '';
  return url.toString();
}

/**
 * Öffnet das Anmeldefenster und liefert die Angaben, die der Dienst an
 * oauth.html zurückgibt. Muss direkt aus einem Tipp oder Klick heraus
 * aufgerufen werden, sonst unterdrückt der Browser das Fenster.
 *
 * `url` darf noch in Arbeit sein (z. B. weil erst eine Prüfsumme berechnet
 * wird). Das Fenster öffnet sich dann sofort leer und wechselt zur Adresse,
 * sobald sie feststeht.
 */
export function openOAuthPopup(
  url: string | Promise<string>,
  state: string,
  windowName: string,
  signal?: AbortSignal
): Promise<URLSearchParams> {
  const popup = window.open(typeof url === 'string' ? url : 'about:blank', windowName, 'popup,width=520,height=680');
  if (!popup) {
    return Promise.reject(new ImportAccessError('Das Anmeldefenster wurde vom Browser unterdrückt.', 'blocked'));
  }

  return new Promise<URLSearchParams>((resolve, reject) => {
    let done = false;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(OAUTH_CHANNEL) : null;

    const finish = (action: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(timer);
      channel?.close();
      try {
        popup.close();
      } catch {
        // Fenster ist schon zu oder nicht mehr erreichbar
      }
      action();
    };

    const accept = (data: unknown) => {
      const message = data as { type?: string; hash?: string } | null;
      if (!message || message.type !== OAUTH_CHANNEL || typeof message.hash !== 'string') return;
      const result = new URLSearchParams(message.hash.replace(/^#/, ''));
      if (result.get('state') !== state) return; // gehört nicht zu dieser Anmeldung
      finish(() => resolve(result));
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) accept(event.data);
    };
    const onAbort = () => finish(() => reject(new ImportAccessError('Die Anmeldung wurde abgebrochen.', 'cancelled')));
    const timer = window.setTimeout(onAbort, ACCESS_TIMEOUT_MS);

    if (channel) channel.onmessage = (event) => accept(event.data);
    window.addEventListener('message', onMessage);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort);

    if (typeof url !== 'string') {
      url.then(
        (target) => {
          if (done) return;
          try {
            popup.location.replace(target);
          } catch {
            finish(() => reject(new ImportAccessError('Das Anmeldefenster konnte nicht geöffnet werden.', 'blocked')));
          }
        },
        () => finish(() => reject(new ImportAccessError('Die Anmeldung konnte nicht vorbereitet werden.', 'network')))
      );
    }
  });
}
