/**
 * Prüft, ob aus dem aktuellen Netz direkte Verbindungen zu anderen Geräten
 * möglich sind.
 *
 * Für eine direkte Verbindung muss ein Gerät wissen, unter welcher Adresse es
 * von außen erreichbar ist. Das erfragt der Browser bei öffentlichen
 * Hilfsservern (STUN). Manche Netze, vor allem im Mobilfunk und in Firmen,
 * geben jedem Ziel eine andere Absenderadresse oder sperren den Weg ganz.
 * Dann gelingt eine direkte Verbindung nur über einen Umweg-Server (TURN).
 *
 * Die Prüfung baut keine Verbindung zu einem Kontakt auf. Sie fragt nur die
 * Hilfsserver, die die App ohnehin verwendet, und wertet die Antworten aus.
 * Adressen werden weder gespeichert noch angezeigt.
 */

export type CandidateKind = 'host' | 'srflx' | 'prflx' | 'relay';

export interface ParsedCandidate {
  kind: CandidateKind;
  protocol: string;
  address: string;
  port: number;
  /** Bei Adressen von außen: der eigene Anschluss, von dem die Anfrage ausging */
  relatedAddress?: string;
  relatedPort?: number;
}

/** Liest eine Zeile aus dem Verbindungsangebot des Browsers (a=candidate:…) */
export function parseCandidate(line: string): ParsedCandidate | null {
  const parts = line.trim().replace(/^a=/, '').replace(/^candidate:/, '').split(/\s+/);
  if (parts.length < 8 || parts[6] !== 'typ') return null;
  const kind = parts[7] as CandidateKind;
  if (!['host', 'srflx', 'prflx', 'relay'].includes(kind)) return null;
  const port = Number(parts[5]);
  if (!Number.isInteger(port)) return null;

  const candidate: ParsedCandidate = { kind, protocol: parts[2].toLowerCase(), address: parts[4], port };
  for (let i = 8; i + 1 < parts.length; i += 2) {
    if (parts[i] === 'raddr') candidate.relatedAddress = parts[i + 1];
    if (parts[i] === 'rport') candidate.relatedPort = Number(parts[i + 1]);
  }
  return candidate;
}

/**
 * - open:      Das Netz zeigt nach außen eine feste Adresse. Direkte Verbindungen sollten klappen.
 * - likely:    Eine Adresse von außen ist bekannt, aber nur von einem Hilfsserver; nicht vergleichbar.
 * - strict:    Das Netz gibt jedem Ziel eine andere Adresse. Klappt nur, wenn die Gegenseite ein einfaches Netz hat.
 * - blocked:   Keine Adresse von außen ermittelbar. Direkte Verbindungen sind nicht zu erwarten.
 * - relay:     Ein Umweg-Server ist eingerichtet und erreichbar. Verbindungen klappen auch aus schwierigen Netzen.
 * - unsupported: Der Browser kann keine direkten Verbindungen aufbauen.
 */
export type NetVerdict = 'open' | 'likely' | 'strict' | 'blocked' | 'relay' | 'unsupported';

export interface NetCheckResult {
  verdict: NetVerdict;
  host: number;
  outside: number;
  relay: number;
  /** Ist in der App ein Umweg-Server eingetragen? */
  relayConfigured: boolean;
  /** true: jedes Ziel sieht dieselbe Adresse; false: verschiedene; null: nicht vergleichbar */
  stable: boolean | null;
}

export function hasRelayServer(servers: RTCIceServer[]): boolean {
  return servers.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/i.test(String(url)))
  );
}

/** Wertet die gesammelten Adressen aus */
export function assessCandidates(candidates: ParsedCandidate[], relayConfigured: boolean): NetCheckResult {
  const host = candidates.filter((candidate) => candidate.kind === 'host').length;
  const outside = candidates.filter((candidate) => candidate.kind === 'srflx' && candidate.protocol === 'udp');
  const relay = candidates.filter((candidate) => candidate.kind === 'relay').length;

  // Antworten verschiedener Hilfsserver auf Anfragen vom selben eigenen Anschluss vergleichen
  const byLocal = new Map<string, Set<string>>();
  for (const candidate of outside) {
    // Manche Browser verbergen den eigenen Anschluss (0.0.0.0:0). Die Adresse von
    // außen gehört deshalb mit zum Schlüssel: Verschiedene Adressen stammen von
    // verschiedenen Netzzugängen (z. B. WLAN und Mobilfunk zugleich) und sind
    // nicht vergleichbar; nur verschiedene Ports unter derselben Adresse zählen.
    const local = `${candidate.relatedAddress ?? ''}:${candidate.relatedPort ?? ''}>${candidate.address}`;
    const seen = byLocal.get(local) ?? new Set<string>();
    seen.add(String(candidate.port));
    byLocal.set(local, seen);
  }
  // Der Browser fasst gleiche Antworten zu einer zusammen. Mehrere verschiedene
  // Antworten für denselben Anschluss bedeuten also: jedes Ziel sieht eine andere Adresse.
  const differing = [...byLocal.values()].some((seen) => seen.size > 1);
  const stable = outside.length === 0 ? null : !differing;

  let verdict: NetVerdict;
  if (relay > 0) verdict = 'relay';
  else if (outside.length === 0) verdict = 'blocked';
  else if (differing) verdict = 'strict';
  else verdict = 'open';

  return { verdict, host, outside: outside.length, relay, relayConfigured, stable };
}

/**
 * Stuft "open" zurück, wenn nur ein Hilfsserver gefragt werden konnte: Dann
 * lässt sich nicht erkennen, ob jedes Ziel dieselbe Adresse sieht.
 */
export function withServerCount(result: NetCheckResult, stunServers: number): NetCheckResult {
  return result.verdict === 'open' && stunServers < 2 ? { ...result, verdict: 'likely', stable: null } : result;
}

function countStunServers(servers: RTCIceServer[]): number {
  return servers
    .flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]))
    .filter((url) => /^stuns?:/i.test(String(url))).length;
}

/** Kurze Zeile zum Weitergeben, ohne Adressen */
export function describeResult(result: NetCheckResult): string {
  const stable = result.stable === null ? 'nicht vergleichbar' : result.stable ? 'gleich' : 'verschieden';
  return `Ergebnis ${result.verdict} · eigene Adressen ${result.host} · von außen ${result.outside} (${stable}) · Umweg ${result.relay}${result.relayConfigured ? '' : ' (nicht eingerichtet)'}`;
}

const GATHER_TIMEOUT_MS = 8000;

/** Fragt die Hilfsserver und wertet die Antworten aus */
export async function runNetworkCheck(servers: RTCIceServer[], timeoutMs = GATHER_TIMEOUT_MS): Promise<NetCheckResult> {
  const relayConfigured = hasRelayServer(servers);
  if (typeof RTCPeerConnection !== 'function') {
    return { verdict: 'unsupported', host: 0, outside: 0, relay: 0, relayConfigured, stable: null };
  }

  const connection = new RTCPeerConnection({ iceServers: servers });
  const candidates: ParsedCandidate[] = [];
  try {
    const finished = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      connection.addEventListener('icecandidate', (event) => {
        if (!event.candidate) {
          clearTimeout(timer);
          resolve();
          return;
        }
        const parsed = parseCandidate(event.candidate.candidate);
        if (parsed) candidates.push(parsed);
      });
    });
    // Ohne Datenkanal sammelt der Browser keine Adressen
    connection.createDataChannel('pruefung');
    await connection.setLocalDescription(await connection.createOffer());
    await finished;
  } finally {
    connection.close();
  }
  return withServerCount(assessCandidates(candidates, relayConfigured), countStunServers(servers));
}
