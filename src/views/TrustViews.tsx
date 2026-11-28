/**
 * Wiederherstellung über Vertraute.
 *
 * - TrustView: Vertraute auswählen. Der Schlüssel eines verschlüsselten
 *   Tresors mit dem ganzen Adressbuch wird in Teile zerlegt; jede und jeder
 *   Vertraute bewahrt einen Teil und eine Kopie des Tresors auf.
 * - HelpRecoverView: Als Vertrauter den aufbewahrten Teil zurückgeben.
 * - RecoverView: Auf einem neuen Gerät die Teile einsammeln und das
 *   Adressbuch wiederherstellen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section, Avatar } from '../ui/Page';
import { ConfirmDialog } from '../ui/Dialog';
import { href } from '../router';
import { contactName, contactSortKey, formatDateTime } from '../model/contact';
import { getP2PManager, type P2PManager } from '../p2p/p2p-manager';
import { formatConnectionCode, normalizeConnectionCode } from '../utils/crypto';
import { clearRecovery, listRecovery, newestVault, recoveryProgress, type RecoveryRecord } from '../trust/custody';
import { MAX_TRUSTED, MIN_TRUSTED, openVault, VaultError } from '../trust/vault';

const KEYPAIR_KEY = 'p2p-keypair';
const RECOVERY_CODE_KEY = 'adressbuch.recoveryCode';

/** Der Verbindungsdienst steht kurz nach dem Start noch nicht bereit */
function useManager(): P2PManager | null {
  const [manager, setManager] = useState<P2PManager | null>(() => getP2PManager());
  useEffect(() => {
    if (manager) return;
    const timer = window.setInterval(() => {
      const current = getP2PManager();
      if (current) {
        setManager(current);
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [manager]);
  return manager;
}

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export const TrustView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const trust = appState.trust;
  const [selected, setSelected] = useState<string[]>(() => Object.keys(trust?.members ?? {}));
  const [threshold, setThreshold] = useState<number>(() => trust?.threshold ?? 2);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const candidates = useMemo(
    () =>
      Object.values(appState.connections)
        .filter((connection) => connection.kind !== 'local')
        .sort((a, b) => contactSortKey(a).localeCompare(contactSortKey(b), 'de')),
    [appState.connections]
  );
  const holding = useMemo(
    () => Object.values(appState.connections).filter((connection) => !!connection.custody),
    [appState.connections]
  );

  const memberIds = Object.keys(trust?.members ?? {});
  const unchanged =
    !!trust &&
    trust.threshold === threshold &&
    memberIds.length === selected.length &&
    memberIds.every((id) => selected.includes(id));
  const needed = Math.min(Math.max(threshold, 2), Math.max(selected.length, 2));
  const valid = selected.length >= MIN_TRUSTED && selected.length <= MAX_TRUSTED;
  const tooFew = !!trust && memberIds.length < trust.threshold;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      if (threshold > Math.max(next.length, 2)) setThreshold(Math.max(next.length, 2));
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const ok = await store.setTrust(selected, needed);
    setSaving(false);
    notify(
      ok
        ? 'Gespeichert. Der Tresor wird hinterlegt, sobald du mit deinen Vertrauten verbunden bist.'
        : 'Das hat nicht geklappt. Wähle zwei bis sieben verbundene Kontakte.'
    );
  };

  const redeposit = async () => {
    await store.requestRedeposit();
    notify('Der Tresor wird bei allen Vertrauten neu hinterlegt, sobald ihr verbunden seid.');
  };

  const clear = async () => {
    setConfirmClear(false);
    await store.clearTrust();
    setSelected([]);
    setThreshold(2);
    notify('Aufgehoben. Deine bisherigen Vertrauten löschen ihren Teil beim nächsten Kontakt.');
  };

  return (
    <Page
      title="Wiederherstellung über Vertraute"
      lead="Geht dein Gerät verloren, können dir Menschen, denen du vertraust, dein Adressbuch zurückgeben. Ganz ohne Passwort und ohne Sicherungsdatei."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <div className="note">
        <p className="note-title">So funktioniert es</p>
        <div className="stack-s small">
          <p>
            Dein Adressbuch wird verschlüsselt in einen Tresor gelegt. Der Schlüssel dazu wird in Teile zerlegt. Jede
            und jeder Vertraute bewahrt einen Teil und eine Kopie des Tresors auf.
          </p>
          <p>
            Ein Teil allein öffnet nichts. Erst wenn so viele Vertraute helfen, wie du festlegst, entsteht der
            Schlüssel wieder.
          </p>
          <p>
            <strong>Ehrlich gesagt:</strong> So viele Vertraute zusammen könnten dein Adressbuch auch ohne dich lesen.
            Wähle Menschen, denen du das zutraust und die sich nicht gegen dich verabreden.
          </p>
        </div>
      </div>

      {trust && (
        <Section title="Stand">
          <p className="strong" data-testid="trust-summary">
            {memberIds.length} Vertraute, {trust.threshold} davon müssen helfen
          </p>
          {tooFew && (
            <p className="error" role="alert">
              Es sind weniger Vertraute übrig, als helfen müssen. Wähle unten weitere aus und speichere.
            </p>
          )}
          <ul className="list" style={{ marginTop: 'var(--s-3)' }}>
            {memberIds.map((id) => {
              const connection = appState.connections[id];
              const name = connection ? contactName(connection) : 'Früherer Kontakt';
              const deposited = trust.members[id].depositedAt;
              return (
                <li className="row" key={id} data-testid="trust-member">
                  <Avatar name={name} />
                  <span className="row-main">
                    <span className="row-title">{name}</span>
                    <span className="row-sub">
                      {deposited
                        ? `Hinterlegt am ${formatDateTime(deposited)}`
                        : 'Wird hinterlegt, sobald ihr beide die App geöffnet habt'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="small muted" style={{ marginTop: 'var(--s-3)' }}>
            Der Tresor wird höchstens einmal am Tag erneuert, wenn du mit der Person verbunden bist. Was du danach
            änderst, fehlt bis zum nächsten Hinterlegen. Deine Vertrauten brauchen die App ab Version 0.5.0.
          </p>
          <div className="actions" style={{ marginTop: 'var(--s-4)' }}>
            <button type="button" className="btn" onClick={redeposit}>
              Jetzt neu hinterlegen
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)}>
              Aufheben
            </button>
          </div>
        </Section>
      )}

      <Section title={trust ? 'Vertraute ändern' : 'Vertraute auswählen'}>
        {candidates.length < MIN_TRUSTED ? (
          <p className="muted">Dafür brauchst du mindestens zwei verbundene Kontakte.</p>
        ) : (
          <div className="stack">
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="visually-hidden">Vertraute</legend>
              <div className="options">
                {candidates.map((connection) => {
                  const name = contactName(connection);
                  return (
                    <label className="option" key={connection.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(connection.id)}
                        onChange={() => toggle(connection.id)}
                      />
                      <span className="option-text">
                        <span className="option-title">{name}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="field">
              <label className="field-label" htmlFor="trust-threshold">
                Wie viele müssen helfen?
              </label>
              <select
                className="input"
                id="trust-threshold"
                value={needed}
                onChange={(event) => setThreshold(Number(event.target.value))}
                disabled={selected.length < MIN_TRUSTED}
              >
                {Array.from({ length: Math.max(selected.length - 1, 1) }, (_, index) => index + 2).map((count) => (
                  <option key={count} value={count}>
                    {count} von {Math.max(selected.length, 2)}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Mehr ist sicherer, weniger ist bequemer. Bei drei Vertrauten sind zwei ein guter Wert: Du kommst auch
                dann an dein Adressbuch, wenn eine Person nicht erreichbar ist.
              </span>
            </div>

            {selected.length > MAX_TRUSTED && (
              <p className="error" role="alert">
                Wähle höchstens {MAX_TRUSTED} Vertraute.
              </p>
            )}

            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || saving || unchanged}>
                {trust ? 'Änderung speichern' : 'Einrichten'}
              </button>
            </div>
            {trust && !unchanged && valid && (
              <p className="small muted">
                Beim Speichern entsteht ein neuer Schlüssel. Die bisherigen Teile werden wertlos, alle Vertrauten
                erhalten neue.
              </p>
            )}
          </div>
        )}
      </Section>

      {holding.length > 0 && (
        <Section title="Du hilfst anderen">
          <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>
            Für diese Kontakte bewahrst du einen Teil auf. Lesen kannst du damit nichts.
          </p>
          <ul className="list">
            {holding.map((connection) => {
              const name = contactName(connection);
              return (
                <li key={connection.id}>
                  <a className="row" href={href('kontakt', connection.id, 'helfen')}>
                    <Avatar name={name} />
                    <span className="row-main">
                      <span className="row-title">{name}</span>
                      <span className="row-sub">Bei der Wiederherstellung helfen</span>
                    </span>
                    <span className="row-arrow" aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <p className="section small">
        <a href={href('wiederherstellen')}>Ich möchte mein Adressbuch über Vertraute wiederherstellen</a>
      </p>

      <ConfirmDialog
        open={confirmClear}
        title="Wiederherstellung über Vertraute aufheben?"
        confirmLabel="Aufheben"
        danger
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      >
        <p>
          Deine Vertrauten werden gebeten, ihren Teil und den Tresor zu löschen. Das geschieht, sobald ihr das nächste
          Mal verbunden seid.
        </p>
        <p className="small muted">Dein Adressbuch auf diesem Gerät bleibt unverändert.</p>
      </ConfirmDialog>
    </Page>
  );
};

type HelpPhase = 'idle' | 'waiting' | 'sent' | 'delivered' | 'missing';

export const HelpRecoverView: React.FC<{ connectionId: string }> = ({ connectionId }) => {
  const { appState } = useAppContext();
  const manager = useManager();
  const connection = appState.connections[connectionId];
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<HelpPhase>('idle');

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = manager.onLink((event) => {
      if (event.type !== 'recovery') return;
      if (event.phase === 'sent' || event.phase === 'delivered' || event.phase === 'missing') setPhase(event.phase);
    });
    return () => {
      unsubscribe();
      manager.endRecovery();
    };
  }, [manager]);

  if (!connection || !connection.custody) {
    return (
      <Page title="Bei der Wiederherstellung helfen" back={{ href: href(), label: 'Kontakte' }}>
        <p>Für diesen Kontakt bewahrst du nichts auf.</p>
      </Page>
    );
  }

  const name = contactName(connection);
  const normalized = normalizeConnectionCode(code);

  const start = (event: React.FormEvent) => {
    event.preventDefault();
    if (!manager || normalized.length !== 8) return;
    manager.helpRecovery(normalized, connectionId);
    setPhase('waiting');
  };

  return (
    <Page
      title={`${name} helfen`}
      lead={`${name} hat dich als Vertrauten gewählt. Mit deinem Teil und denen anderer Vertrauter kommt ${name} wieder an das eigene Adressbuch.`}
      back={{ href: href('kontakt', connectionId), label: name }}
    >
      <div className="note note-danger">
        <p className="note-title">Erst prüfen, dann helfen</p>
        <p className="small">
          Gib deinen Teil nur weiter, wenn du sicher bist, dass wirklich {name} danach fragt. Ruf an oder sprich
          persönlich. Eine Nachricht allein genügt nicht, denn ein Konto kann gestohlen sein. Wer genug Teile
          einsammelt, kann das ganze Adressbuch von {name} lesen.
        </p>
      </div>

      {phase === 'delivered' ? (
        <Section title="Übergeben">
          <p role="status">
            Dein Teil ist bei {name} angekommen. Sobald genug Vertraute geholfen haben, ist das Adressbuch wieder da
            und ihr seid wie zuvor verbunden.
          </p>
          <div className="actions" style={{ marginTop: 'var(--s-4)' }}>
            <a className="btn" href={href('kontakt', connectionId)}>
              Zurück zum Kontakt
            </a>
          </div>
        </Section>
      ) : (
        <Section title="Code eingeben">
          <form className="stack" onSubmit={start} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="help-code">
                Code vom neuen Gerät
              </label>
              <input
                className="input code"
                id="help-code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD-EFGH"
                maxLength={40}
                value={normalized.length === 8 ? formatConnectionCode(normalized) : code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                disabled={phase !== 'idle'}
              />
              <span className="field-hint">
                {name} sieht den Code auf dem neuen Gerät unter „Über Vertraute wiederherstellen“ und liest ihn dir vor.
              </span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!manager || normalized.length !== 8 || phase !== 'idle'}>
              Meinen Teil übergeben
            </button>
            {phase === 'waiting' && (
              <p role="status" className="muted">
                Einen Moment … Die Verbindung zum neuen Gerät wird aufgebaut. Beide müssen die App geöffnet haben.
              </p>
            )}
            {phase === 'sent' && (
              <p role="status" className="muted">
                Dein Teil wird übertragen …
              </p>
            )}
            {phase === 'missing' && (
              <p className="error" role="alert">
                Auf diesem Gerät ist für {name} nichts (mehr) hinterlegt.
              </p>
            )}
          </form>
        </Section>
      )}
    </Page>
  );
};

export const RecoverView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const manager = useManager();
  const [code, setCode] = useState('');
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const refresh = useCallback(async () => {
    setRecords(await listRecovery());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!manager) return;
    const current = manager.startRecovery(readStored(RECOVERY_CODE_KEY) || undefined);
    try {
      localStorage.setItem(RECOVERY_CODE_KEY, current);
    } catch {
      // ohne Speicherzugriff gilt der Code nur, solange die Seite offen ist
    }
    setCode(current);
    const unsubscribe = manager.onLink((event) => {
      if (event.type === 'recovery' && event.phase === 'received') void refresh();
    });
    return () => {
      unsubscribe();
      manager.endRecovery();
    };
  }, [manager, refresh]);

  const progress = useMemo(() => recoveryProgress(records), [records]);
  const hasData =
    Object.keys(appState.connections).length > 0 || !!appState.myCard.firstName || !!appState.myCard.lastName;

  const forget = () => {
    try {
      localStorage.removeItem(RECOVERY_CODE_KEY);
    } catch {
      // nichts gespeichert
    }
  };

  const restore = async () => {
    if (!progress || !progress.complete) return;
    setConfirm(false);
    setError('');
    setBusy(true);
    try {
      const content = await openVault(
        newestVault(progress.pieces),
        progress.pieces.map((piece) => piece.share)
      );
      await store.replaceWith(content.snapshot);
      if (content.keyPair) localStorage.setItem(KEYPAIR_KEY, JSON.stringify(content.keyPair));
      await clearRecovery();
      forget();
      // Neu starten, damit die Verbindungen mit dem wiederhergestellten Schlüssel aufgebaut werden
      window.location.hash = '';
      window.location.reload();
    } catch (failure) {
      setError(
        failure instanceof VaultError || failure instanceof Error
          ? failure.message
          : 'Das Adressbuch konnte nicht wiederhergestellt werden.'
      );
      setBusy(false);
    }
  };

  const cancel = async () => {
    await clearRecovery();
    forget();
    manager?.endRecovery();
    setRecords([]);
    notify('Abgebrochen. Die erhaltenen Teile wurden gelöscht.');
    window.location.hash = '';
  };

  return (
    <Page
      title="Über Vertraute wiederherstellen"
      lead="Du hast auf deinem früheren Gerät Vertraute festgelegt? Dann können sie dir dein Adressbuch jetzt zurückgeben."
      back={{ href: href(), label: 'Start' }}
    >
      <Section title="1. Vertraute anrufen">
        <div className="stack">
          <p>
            Ruf deine Vertrauten an und nenne ihnen diesen Code. Sie öffnen in ihrer App deinen Kontakt und wählen{' '}
            <strong>Bei der Wiederherstellung helfen</strong>.
          </p>
          <p className="center">
            <span className="small muted">Dein Code</span>
            <br />
            <span className="code" data-testid="recovery-code">
              {code ? formatConnectionCode(code) : '…'}
            </span>
          </p>
          <p className="small muted">
            Lass diese Seite geöffnet, während deine Vertrauten helfen. Sie müssen nicht gleichzeitig Zeit haben: Der
            Code bleibt gültig und erhaltene Teile bleiben auf diesem Gerät gespeichert.
          </p>
        </div>
      </Section>

      <Section title="2. Teile einsammeln">
        {progress ? (
          <>
            <p className="strong" role="status" data-testid="recovery-progress">
              {progress.pieces.length} von {progress.threshold} Teilen erhalten
            </p>
            <ul className="list" style={{ marginTop: 'var(--s-3)' }}>
              {progress.pieces.map((piece) => (
                <li className="row" key={piece.id}>
                  <Avatar name={piece.helperName || '?'} />
                  <span className="row-main">
                    <span className="row-title">{piece.helperName || 'Eine vertraute Person'}</span>
                    <span className="row-sub">Stand des Adressbuchs: {formatDateTime(piece.version)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted" role="status" data-testid="recovery-progress">
            Noch kein Teil erhalten.
          </p>
        )}
      </Section>

      <Section title="3. Wiederherstellen">
        <div className="stack">
          {!progress?.complete && <p className="muted">Sobald genug Teile da sind, geht es hier weiter.</p>}
          {progress?.complete && (
            <p>
              Es sind genug Teile da. Dein Adressbuch wird so wiederhergestellt, wie es zuletzt hinterlegt wurde. Deine
              Kontakte verbinden sich danach von selbst wieder mit dir.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!progress?.complete || busy}
              onClick={() => (hasData ? setConfirm(true) : void restore())}
            >
              Adressbuch wiederherstellen
            </button>
            {records.length > 0 && (
              <button type="button" className="btn btn-quiet" onClick={cancel} disabled={busy}>
                Abbrechen und Teile löschen
              </button>
            )}
          </div>
        </div>
      </Section>

      <ConfirmDialog
        open={confirm}
        title="Vorhandenes Adressbuch ersetzen?"
        confirmLabel="Ersetzen und wiederherstellen"
        danger
        onConfirm={restore}
        onCancel={() => setConfirm(false)}
      >
        <p>
          Auf diesem Gerät gibt es schon ein Adressbuch. Es wird vollständig durch den wiederhergestellten Stand
          ersetzt.
        </p>
      </ConfirmDialog>
    </Page>
  );
};
