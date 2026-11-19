/**
 * Betriebskonfiguration. Nutzer müssen hier nichts einstellen: Ohne Angaben
 * wird der Vermittlungsdienst unter derselben Adresse wie die App erwartet
 * (Pfad /signal).
 */

/**
 * Adresse des Vermittlungsdienstes.
 * Überschreibbar beim Bauen mit VITE_SIGNALING_URL (z. B. wss://example.org/signal).
 */
export function getSignalingUrl(): string {
  const configured = import.meta.env.VITE_SIGNALING_URL;
  if (configured) return configured;

  const url = new URL('signal', document.baseURI);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.hash = '';
  url.search = '';
  return url.toString();
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
];

/**
 * Server für den direkten Verbindungsaufbau zwischen zwei Geräten.
 * Überschreibbar beim Bauen mit VITE_ICE_SERVERS (JSON-Liste, z. B. mit eigenem TURN-Server).
 */
export function getIceServers(): RTCIceServer[] {
  const configured = import.meta.env.VITE_ICE_SERVERS;
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed)) return parsed as RTCIceServer[];
    } catch (error) {
      console.warn('VITE_ICE_SERVERS ist kein gültiges JSON, nutze Standard', error);
    }
  }
  return DEFAULT_ICE_SERVERS;
}

/** Link, der die App direkt mit einer Einladung öffnet */
export function buildInviteLink(code: string): string {
  const url = new URL(document.baseURI);
  url.search = '';
  url.hash = `/verbinden/${code}`;
  return url.toString();
}
