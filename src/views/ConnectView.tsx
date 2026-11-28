/**
 * Verbinden in drei Schritten:
 *   1. Auswählen, was die andere Person sehen darf
 *   2. Code zeigen oder Einladung annehmen
 *   3. Fertig
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAppContext } from '../context/AppContext';
import { getP2PManager } from '../p2p/p2p-manager';
import { Page } from '../ui/Page';
import { SharePicker } from '../ui/SharePicker';
import { QrScanner } from '../ui/QrScanner';
import { href, replaceRoute } from '../router';
import { buildInviteLink } from '../config';
import { formatConnectionCode, normalizeConnectionCode } from '../utils/crypto';
import { DEFAULT_PRESET_ID, SHARE_PRESETS, describeShare } from '../model/fields';
import { contactName } from '../model/contact';

interface ConnectViewProps {
  /** Code aus einem Einladungslink */
  code?: string;
  /** Importierter Eintrag, der in die neue Verbindung übergehen soll */
  forContactId?: string;
}

type Mode = 'invite' | 'accept';
type Step = 'share' | 'link' | 'done';

const SLOW_AFTER_MS = 20000;

/** Liest den Einladungscode aus einem gescannten oder eingefügten Text */
function extractCode(text: string): string {
  const trimmed = text.trim();
  const fromLink = trimmed.match(/verbinden\/([A-Za-z0-9-]{8,9})/);
  if (fromLink) return normalizeConnectionCode(fromLink[1]);
  try {
    // ältere QR-Codes enthielten JSON mit dem Code
    const legacy = JSON.parse(trimmed);
    if (legacy && typeof legacy.roomCode === 'string') return normalizeConnectionCode(legacy.roomCode);
  } catch {
    // kein JSON
  }
  return normalizeConnectionCode(trimmed);
}

export const ConnectView: React.FC<ConnectViewProps> = ({ code: linkCode, forContactId }) => {
  const { appState, serviceStatus, notify } = useAppContext();
  const forContact = forContactId ? appState.connections[forContactId] : undefined;

  const [mode, setMode] = useState<Mode>(linkCode ? 'accept' : 'invite');
  const [step, setStep] = useState<Step>('share');
  const [fields, setFields] = useState<string[]>(() => [
    ...SHARE_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!.fields,
  ]);
  const [code, setCode] = useState(linkCode ? normalizeConnectionCode(linkCode) : '');
  const [inviteCode, setInviteCode] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [wasKnown, setWasKnown] = useState(false);
  const slowTimer = useRef<number | null>(null);

  // Einladung beim Verlassen der Ansicht schließen
  useEffect(() => {
    return () => {
      getP2PManager()?.endInvite();
      if (slowTimer.current !== null) clearTimeout(slowTimer.current);
    };
  }, []);

  // Auf das Zustandekommen der Verbindung warten
  useEffect(() => {
    const manager = getP2PManager();
    if (!manager) return;
    return manager.onLink((event) => {
      if (event.type === 'linked' && event.viaInvite) {
        setLinkedId(event.connectionId);
        setWasKnown(!event.isNew);
        setStep('done');
        setWaiting(false);
        manager.endInvite();
      } else if (event.type === 'failed' && event.duringInvite) {
        setFailed(true);
      }
    });
  }, []);

  const startSlowTimer = () => {
    setSlow(false);
    setFailed(false);
    if (slowTimer.current !== null) clearTimeout(slowTimer.current);
    slowTimer.current = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
  };

  const openInvite = async () => {
    const manager = getP2PManager();
    if (!manager) return;
    const newCode = manager.startInvite(fields, forContactId);
    setInviteCode(newCode);
    setStep('link');
    setWaiting(true);
    setFailed(false);
    try {
      setQrUrl(
        await QRCode.toDataURL(buildInviteLink(newCode), {
          width: 520,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        })
      );
    } catch (error) {
      console.error('QR-Code konnte nicht erzeugt werden', error);
    }
  };

  const accept = (rawCode: string) => {
    const manager = getP2PManager();
    const normalized = extractCode(rawCode);
    if (!manager || normalized.length !== 8) return;
    setCode(normalized);
    manager.acceptInvite(normalized, fields, forContactId);
    setStep('link');
    setWaiting(true);
    startSlowTimer();
  };

  const share = async () => {
    const link = buildInviteLink(inviteCode);
    const text = 'Verbinde dich mit mir im P2P Adressbuch:';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'P2P Adressbuch', text, url: link });
        return;
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(link);
      notify('Link kopiert. Schick ihn der anderen Person.');
    } catch {
      notify('Der Link konnte nicht kopiert werden. Lies stattdessen den Code vor.');
    }
  };

  const linked = linkedId ? appState.connections[linkedId] : undefined;
  const back = forContact
    ? { href: href('kontakt', forContactId!), label: contactName(forContact) }
    : { href: href(), label: 'Kontakte' };

  // ---------- Schritt 3: fertig ----------
  if (step === 'done' && linkedId) {
    const name = linked ? contactName(linked) : 'deinem Kontakt';
    return (
      <Page title={wasKnown ? 'Ihr seid bereits verbunden' : 'Verbunden'} back={back}>
        <p className="step">Schritt 3 von 3</p>
        <div className="stack">
          <p>
            Du bist jetzt mit <strong>{name}</strong> verbunden. Ändert einer von euch seine Karte,
            steht es beim anderen automatisch richtig.
          </p>
          {linked && (
            <p className="muted">
              {name} sieht von dir: {describeShare(linked.allowedFields)}. Das kannst du jederzeit ändern.
            </p>
          )}
          <div className="actions">
            <a className="btn btn-primary" href={href('kontakt', linkedId)}>
              Kontakt ansehen
            </a>
            <a className="btn" href={href()}>
              Fertig
            </a>
          </div>
        </div>
      </Page>
    );
  }

  // ---------- Schritt 2: Code zeigen / verbinden ----------
  if (step === 'link') {
    return (
      <Page title={mode === 'invite' ? 'Code zeigen' : 'Verbindung wird hergestellt'} back={back}>
        <p className="step">Schritt 2 von 3</p>

        {mode === 'invite' ? (
          <div className="stack">
            <p>
              Lass die andere Person diesen Code mit der Handykamera scannen, oder schick ihr den Link.
              Lass diese Seite geöffnet, bis ihr verbunden seid.
            </p>
            {qrUrl && <img className="qr" src={qrUrl} alt="QR-Code mit dem Einladungslink" width={260} height={260} />}
            <p className="center">
              <span className="small muted">Code zum Eintippen</span>
              <br />
              <span className="code" data-testid="invite-code">
                {formatConnectionCode(inviteCode)}
              </span>
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={share}>
              Link teilen
            </button>
          </div>
        ) : (
          <p>Die Verbindung mit dem Code {formatConnectionCode(code)} wird aufgebaut.</p>
        )}

        <div className="section" aria-live="polite">
          {serviceStatus !== 'online' ? (
            <div className="note">
              <p className="note-title">Keine Internetverbindung</p>
              <p className="small">
                Zum Verbinden brauchen beide Geräte Internet. Sobald du wieder online bist, geht es von
                selbst weiter.
              </p>
            </div>
          ) : failed ? (
            <div className="note">
              <p className="note-title">Die Verbindung kam nicht zustande</p>
              <p className="small">
                Manche Netze (z. B. Firmen- oder Gäste-WLAN) lassen direkte Verbindungen nicht zu.
                Versucht es beide im selben WLAN oder über mobile Daten. Es wird automatisch erneut
                versucht.
              </p>
            </div>
          ) : slow ? (
            <div className="note">
              <p className="note-title">Das dauert länger als üblich</p>
              <p className="small">
                Hat die andere Person die App geöffnet und zeigt sie den Code noch an? Stimmt der Code?
                Ein Code gilt nur, solange die Seite mit dem Code offen ist.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    getP2PManager()?.endInvite();
                    setStep('share');
                    setWaiting(false);
                  }}
                >
                  Code neu eingeben
                </button>
              </div>
            </div>
          ) : (
            waiting && (
              <p className="muted">
                {mode === 'invite' ? 'Warte auf die andere Person …' : 'Einen Moment …'}
              </p>
            )
          )}
        </div>
      </Page>
    );
  }

  // ---------- Schritt 1: Freigabe wählen ----------
  return (
    <Page
      title={forContact ? `${contactName(forContact)} einladen` : 'Kontakt verbinden'}
      back={back}
    >
      {!linkCode && (
        <div className="segmented" role="radiogroup" aria-label="Wer lädt ein?">
          <label>
            <input type="radio" name="mode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
            Ich lade ein
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 'accept'} onChange={() => setMode('accept')} />
            Ich habe einen Code
          </label>
        </div>
      )}

      <div className="section">
        <p className="step">Schritt 1 von 3</p>
        <h3 className="page-title" style={{ fontSize: 'var(--text-l)', marginBottom: 'var(--s-3)' }}>
          Was darf die andere Person von dir sehen?
        </h3>
        <SharePicker value={fields} onChange={setFields} myCard={appState.myCard} />
        <p className="small muted" style={{ marginTop: 'var(--s-3)' }}>
          Du kannst das später jederzeit ändern oder widerrufen.
        </p>
      </div>

      {mode === 'accept' && !linkCode && (
        <div className="section stack">
          {scanning ? (
            <>
              <QrScanner
                onResult={(text) => {
                  const scanned = extractCode(text);
                  if (scanned.length === 8) {
                    setScanning(false);
                    accept(scanned);
                  }
                }}
              />
              <button type="button" className="btn btn-block" onClick={() => setScanning(false)}>
                Scannen beenden
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-block" onClick={() => setScanning(true)}>
              Code mit der Kamera scannen
            </button>
          )}
          <div className="field">
            <label className="field-label" htmlFor="code">
              Oder Code eintippen
            </label>
            <input
              className="input code"
              id="code"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD-EFGH"
              maxLength={40}
              value={code.length === 8 ? formatConnectionCode(code) : code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
        </div>
      )}

      <div className="form-bar">
        {mode === 'invite' ? (
          <button type="button" className="btn btn-primary" onClick={openInvite}>
            Weiter: Code zeigen
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => accept(code)}
            disabled={extractCode(code).length !== 8}
          >
            Verbinden
          </button>
        )}
        {linkCode && (
          <button type="button" className="btn btn-quiet" onClick={() => replaceRoute()}>
            Nicht verbinden
          </button>
        )}
      </div>
    </Page>
  );
};
