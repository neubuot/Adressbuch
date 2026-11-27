/**
 * Mehr: Sicherung, Import/Export, Tags, Installation, Darstellung
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Page, Section } from '../ui/Page';
import { href } from '../router';
import { getLastBackupAt } from '../io/backup';
import { formatDate } from '../model/contact';
import { getTheme, setTheme, type Theme } from '../model/theme';
import { InstallCard } from '../ui/InstallCard';
import { MANUAL_SOURCE_ID } from '../types';
import { findDuplicates } from '../model/dedupe';
import { getVersionInfo, versionLine } from '../version';

export const MoreView: React.FC = () => {
  const { appState } = useAppContext();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const lastBackup = getLastBackupAt();
  const tagCount = Object.keys(appState.tags ?? {}).length;
  const contactCount = Object.keys(appState.connections).length;
  const duplicateCount = useMemo(
    () => findDuplicates(appState.connections ?? {}, appState.notDuplicates).length,
    [appState.connections, appState.notDuplicates]
  );
  const sourceCount = Object.values(appState.sources ?? {}).filter((source) => source.id !== MANUAL_SOURCE_ID).length;
  const version = getVersionInfo();

  const chooseTheme = (next: Theme) => {
    setTheme(next);
    setThemeState(next);
  };

  return (
    <Page title="Mehr">
      <ul className="list">
        <li>
          <a className="row" href={href('mehr', 'sicherung')}>
            <span className="row-main">
              <span className="row-title">Daten sichern und wiederherstellen</span>
              <span className="row-sub">
                {lastBackup ? `Letzte Sicherung am ${formatDate(lastBackup)}` : 'Noch keine Sicherung'}
              </span>
            </span>
            <span className="row-arrow" aria-hidden="true" />
          </a>
        </li>
        <li>
          <a className="row" href={href('mehr', 'import')}>
            <span className="row-main">
              <span className="row-title">Vorhandene Kontakte übernehmen</span>
              <span className="row-sub">Aus dem Telefonbuch (vCard) oder einer Tabelle (CSV)</span>
            </span>
            <span className="row-arrow" aria-hidden="true" />
          </a>
        </li>
        {sourceCount > 0 && (
          <li>
            <a className="row" href={href('mehr', 'quellen')}>
              <span className="row-main">
                <span className="row-title">Übernommene Kontakte</span>
                <span className="row-sub">Woher sie stammen, was bei Abweichungen gilt, zurücknehmen</span>
              </span>
              <span className="row-arrow" aria-hidden="true" />
            </a>
          </li>
        )}
        {(duplicateCount > 0 || sourceCount > 0) && (
          <li>
            <a className="row" href={href('mehr', 'doppelt')}>
              <span className="row-main">
                <span className="row-title">Doppelte Einträge</span>
                <span className="row-sub">
                  {duplicateCount === 0
                    ? 'Keine gefunden'
                    : duplicateCount === 1
                      ? '1 Paar zu prüfen'
                      : `${duplicateCount} Paare zu prüfen`}
                </span>
              </span>
              <span className="row-arrow" aria-hidden="true" />
            </a>
          </li>
        )}
        <li>
          <a className="row" href={href('mehr', 'export')}>
            <span className="row-main">
              <span className="row-title">Kontakte exportieren</span>
              <span className="row-sub">
                {contactCount === 1 ? '1 Kontakt' : `${contactCount} Kontakte`} als Tabelle, Kontaktdatei oder JSON
              </span>
            </span>
            <span className="row-arrow" aria-hidden="true" />
          </a>
        </li>
        <li>
          <a className="row" href={href('mehr', 'tags')}>
            <span className="row-main">
              <span className="row-title">Tags</span>
              <span className="row-sub">{tagCount === 1 ? '1 Tag' : `${tagCount} Tags`}</span>
            </span>
            <span className="row-arrow" aria-hidden="true" />
          </a>
        </li>
        <li>
          <a className="row" href={href('mehr', 'verbindung')}>
            <span className="row-main">
              <span className="row-title">Verbindung prüfen</span>
              <span className="row-sub">Wenn sich ein Kontakt nicht verbinden lässt</span>
            </span>
            <span className="row-arrow" aria-hidden="true" />
          </a>
        </li>
      </ul>

      <InstallCard />

      <Section title="Darstellung">
        <div className="segmented" role="radiogroup" aria-label="Darstellung">
          {(
            [
              ['auto', 'Wie das Gerät'],
              ['light', 'Hell'],
              ['dark', 'Dunkel'],
            ] as Array<[Theme, string]>
          ).map(([id, label]) => (
            <label key={id}>
              <input type="radio" name="theme" checked={theme === id} onChange={() => chooseTheme(id)} />
              {label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="So funktioniert es">
        <div className="stack small">
          <p>
            Dein Adressbuch liegt nur auf diesem Gerät. Es gibt kein Konto und keinen zentralen
            Speicher. Jeder pflegt seine eigene Karte und legt für jeden Kontakt fest, was dieser
            sehen darf.
          </p>
          <p>
            Änderungen gehen direkt von Gerät zu Gerät. Dafür müssen beide die App gleichzeitig
            geöffnet haben; sonst wird die Änderung beim nächsten Mal nachgeholt.
          </p>
        </div>
      </Section>

      <Section title="Über diese App">
        <dl className="facts">
          <div className="fact">
            <dt>Version</dt>
            <dd data-testid="app-version">{versionLine(version)}</dd>
          </div>
          <div className="fact">
            <dt>Datenformat</dt>
            <dd>{version.schema}</dd>
          </div>
        </dl>
        <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
          Wenn etwas nicht so läuft wie erwartet, nenne bitte diese Version.
        </p>
      </Section>
    </Page>
  );
};
