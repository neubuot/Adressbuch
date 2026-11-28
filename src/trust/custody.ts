/**
 * Ablage auf dem Gerät für die Wiederherstellung über Vertraute:
 *
 * - `custody`: was dieses Gerät für andere aufbewahrt (ein Teil des
 *   Tresorschlüssels und eine Kopie des Tresors je Kontakt),
 * - `recovery`: was dieses Gerät bei einer laufenden eigenen
 *   Wiederherstellung von Vertrauten erhalten hat.
 *
 * Beides liegt bewusst außerhalb des Adressbuchs: Es wird nicht mit
 * gesichert und nicht übertragen.
 */

import { db } from '../store/db';

/** Was ein Vertrauter für jemanden aufbewahrt oder übergibt */
export interface VaultPiece {
  /** Kennung der Einrichtung, zu der Teil und Tresor gehören */
  setId: string;
  threshold: number;
  share: string;
  /** Stand des Tresors (ISO-Zeitpunkt) */
  version: string;
  vault: string;
}

export interface CustodyRecord extends VaultPiece {
  /** Kennung des Kontakts, dem der Tresor gehört */
  id: string;
  receivedAt: string;
}

export interface RecoveryRecord extends VaultPiece {
  /** setId und Teil zusammen: derselbe Teil zählt nur einmal */
  id: string;
  helperName: string;
  receivedAt: string;
}

export async function getCustody(connectionId: string): Promise<CustodyRecord | undefined> {
  try {
    return await db.custody.get(connectionId);
  } catch {
    return undefined;
  }
}

export async function putCustody(connectionId: string, piece: VaultPiece): Promise<void> {
  await db.custody.put({ ...piece, id: connectionId, receivedAt: new Date().toISOString() });
}

export async function deleteCustody(connectionId: string): Promise<void> {
  try {
    await db.custody.delete(connectionId);
  } catch {
    // nichts aufbewahrt
  }
}

export async function listRecovery(): Promise<RecoveryRecord[]> {
  try {
    return await db.recovery.toArray();
  } catch {
    return [];
  }
}

export async function putRecovery(piece: VaultPiece, helperName: string): Promise<void> {
  await db.recovery.put({
    ...piece,
    id: `${piece.setId}|${piece.share}`,
    helperName,
    receivedAt: new Date().toISOString(),
  });
}

export async function clearRecovery(): Promise<void> {
  try {
    await db.recovery.clear();
  } catch {
    // nichts zu löschen
  }
}

export interface RecoveryProgress {
  setId: string;
  threshold: number;
  pieces: RecoveryRecord[];
  /** true, sobald genügend Teile derselben Einrichtung da sind */
  complete: boolean;
}

/**
 * Wertet die erhaltenen Teile aus. Gehören sie zu verschiedenen
 * Einrichtungen (etwa weil die Vertrauten zwischendurch geändert wurden),
 * zählt die Einrichtung mit dem neuesten Tresor, für die genug Teile da sind,
 * sonst die mit den meisten Teilen.
 */
export function recoveryProgress(records: RecoveryRecord[]): RecoveryProgress | null {
  if (records.length === 0) return null;
  const groups = new Map<string, RecoveryRecord[]>();
  for (const record of records) {
    const group = groups.get(record.setId) ?? [];
    group.push(record);
    groups.set(record.setId, group);
  }
  const candidates = Array.from(groups.entries()).map(([setId, pieces]) => {
    const threshold = Math.max(2, ...pieces.map((piece) => piece.threshold));
    const newest = pieces.reduce((a, b) => (a.version >= b.version ? a : b)).version;
    return { setId, threshold, pieces, complete: pieces.length >= threshold, newest };
  });
  candidates.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.complete) return b.newest.localeCompare(a.newest);
    return b.pieces.length - a.pieces.length || b.newest.localeCompare(a.newest);
  });
  const best = candidates[0];
  return { setId: best.setId, threshold: best.threshold, pieces: best.pieces, complete: best.complete };
}

/** Der neueste Tresor unter den Teilen */
export function newestVault(pieces: VaultPiece[]): string {
  return pieces.reduce((a, b) => (a.version >= b.version ? a : b)).vault;
}
