/**
 * Verbindung prüfen: Zeigt, ob aus dem aktuellen Netz direkte Verbindungen
 * zu anderen Geräten zu erwarten sind. Gedacht für den Fall, dass sich ein
 * Kontakt nicht verbinden lässt, etwa unterwegs im Mobilfunknetz.
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Page, Section } from '../ui/Page';
import { href } from '../router';
import { getIceServers } from '../config';
import { describeResult, runNetworkCheck, type NetCheckResult, type NetVerdict } from '../p2p/netcheck';
import { getVersionInfo, versionLine } from '../version';

const VERDICT_TEXT: Record<NetVerdict, { title: string; text: string }> = {
  open: {
    title: 'Dieses Netz ist geeignet',
    text: 'Direkte Verbindungen zu deinen Kontakten sollten von hier aus klappen.',
  },
  likely: {
    title: 'Dieses Netz ist vermutlich geeignet',
    text: 'Dein Gerät ist von außen erreichbar. Ob das für jede Gegenstelle gilt, ließ sich nicht vergleichen.',
  },
  strict: {
    title: 'Dieses Netz ist schwierig',
    text: 'Dein Netz zeigt jeder Gegenstelle eine andere Adresse. Das ist im Mobilfunk und in Firmennetzen üblich. Eine Verbindung klappt dann nur, wenn dein Kontakt in einem einfachen Netz ist, zum Beispiel im WLAN zu Hause. Versuche es sonst selbst in einem WLAN.',
  },
  blocked: {
    title: 'Dieses Netz lässt direkte Verbindungen nicht zu',
    text: 'Dein Gerät konnte nicht ermitteln, wie es von außen erreichbar ist. Von hier aus werden sich Kontakte voraussichtlich nicht verbinden. Versuche es in einem anderen Netz.',
  },
  relay: {
    title: 'Verbindungen klappen auch aus schwierigen Netzen',
    text: 'Für dieses Adressbuch ist ein Umweg eingerichtet und von hier aus erreichbar. Er springt ein, wenn zwei Geräte einander nicht direkt erreichen.',
  },
  unsupported: {
    title: 'Dieser Browser kann keine direkten Verbindungen aufbauen',
    text: 'Öffne das Adressbuch in einem aktuellen Browser.',
  },
};

const SERVICE_TEXT = {
  online: 'erreichbar',
  connecting: 'wird gerade verbunden',
  offline: 'nicht erreichbar',
} as const;

export const NetCheckView: React.FC = () => {
  const { serviceStatus } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NetCheckResult | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setResult(await runNetworkCheck(getIceServers()));
    } catch {
      setResult(null);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const verdict = result ? VERDICT_TEXT[result.verdict] : null;
  const needsRelay = result && !result.relayConfigured && (result.verdict === 'strict' || result.verdict === 'blocked');

  return (
    <Page
      title="Verbindung prüfen"
      lead="Lässt sich ein Kontakt nicht verbinden, liegt es oft am Netz, in dem du gerade bist. Hier siehst du, ob dein aktuelles Netz direkte Verbindungen zulässt."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <div className="stack">
        <dl className="facts">
          <div className="fact">
            <dt>Vermittlung beim Verbinden</dt>
            <dd data-testid="netcheck-service">{SERVICE_TEXT[serviceStatus]}</dd>
          </div>
        </dl>

        <div className="field">
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? 'Prüfe …' : result ? 'Noch einmal prüfen' : 'Jetzt prüfen'}
          </button>
          <span className="field-hint">
            Die Prüfung dauert einige Sekunden und gilt für das Netz, in dem du gerade bist (WLAN oder Mobilfunk).
            Es wird keine Verbindung zu einem Kontakt aufgebaut.
          </span>
        </div>

        {failed && (
          <p className="error" role="alert">
            Die Prüfung konnte nicht durchgeführt werden. Versuche es noch einmal.
          </p>
        )}
      </div>

      {result && verdict && (
        <Section title={verdict.title}>
          <div className="stack small" role="status">
            <p>{verdict.text}</p>
            {needsRelay && (
              <p>
                Der Betreiber dieses Adressbuchs kann einen Umweg einrichten, über den sich Geräte auch aus solchen
                Netzen erreichen. Bisher ist keiner eingerichtet.
              </p>
            )}
            <p className="muted">
              Für Rückfragen: <span data-testid="netcheck-detail">{describeResult(result)}</span> · Version{' '}
              {versionLine(getVersionInfo())}
            </p>
          </div>
        </Section>
      )}
    </Page>
  );
};
