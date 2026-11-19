/**
 * Hinweis, wie sich das Adressbuch als App installieren lässt
 */

import { Section } from './Page';
import { useInstall } from '../pwa';
import { useAppContext } from '../context/AppContext';

export const InstallCard: React.FC = () => {
  const { state, install } = useInstall();
  const { notify } = useAppContext();

  if (state === 'installed') {
    return (
      <Section title="App">
        <p className="small muted">Das Adressbuch ist auf diesem Gerät installiert und funktioniert auch ohne Internet.</p>
      </Section>
    );
  }

  return (
    <Section title="Als App installieren">
      <div className="stack">
        <p className="small">
          Installiert liegt das Adressbuch wie jede andere App auf dem Startbildschirm, öffnet sich
          ohne Adresszeile und funktioniert auch ohne Internet.
        </p>
        {state === 'promptable' && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (await install()) notify('Das Adressbuch ist jetzt installiert.');
            }}
          >
            Installieren
          </button>
        )}
        {state === 'ios' && (
          <ol className="small stack-s" style={{ listStyle: 'decimal', paddingLeft: '1.25rem' }}>
            <li>Öffne diese Seite in Safari.</li>
            <li>Tippe unten auf „Teilen“ (das Quadrat mit dem Pfeil nach oben).</li>
            <li>Wähle „Zum Home-Bildschirm“ und bestätige mit „Hinzufügen“.</li>
          </ol>
        )}
        {state === 'manual' && (
          <p className="small muted">
            Öffne das Menü deines Browsers und wähle „App installieren“ oder „Zum Startbildschirm
            hinzufügen“. In Chrome und Edge am Computer steht dafür auch ein Symbol rechts in der
            Adresszeile.
          </p>
        )}
      </div>
    </Section>
  );
};
