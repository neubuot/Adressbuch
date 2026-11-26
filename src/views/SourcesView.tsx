/**
 * Importquellen: Woher übernommene Angaben stammen, welche Quelle bei
 * Abweichungen gilt, und ein Import als Ganzes zurücknehmen.
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page } from '../ui/Page';
import { ConfirmDialog } from '../ui/Dialog';
import { href } from '../router';
import { formatDate } from '../model/contact';
import { MANUAL_SOURCE_ID, type ImportSource } from '../types';

export const SourcesView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [undo, setUndo] = useState<ImportSource | null>(null);

  const counts = new Map<string, number>();
  for (const connection of Object.values(appState.connections ?? {})) {
    const seen = new Set<string>();
    for (const record of Object.values(connection.records ?? {})) seen.add(record.sourceId);
    for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const sources = Object.values(appState.sources ?? {})
    .filter((source) => source.id !== MANUAL_SOURCE_ID && (counts.get(source.id) ?? 0) > 0)
    .sort((a, b) => a.rank - b.rank);
  const preview = undo ? store.previewUndoImport(undo.id) : { removed: 0, kept: 0 };

  const confirmUndo = async () => {
    if (!undo) return;
    const name = undo.name;
    const result = await store.undoImport(undo.id);
    setUndo(null);
    notify(`Import aus ${name} zurückgenommen: ${result.removed} gelöscht, ${result.kept} behalten ihre übrigen Angaben.`);
  };

  return (
    <Page
      title="Übernommene Kontakte"
      lead="Von hier stammen die Angaben, die du übernommen hast. Weichen Angaben voneinander ab, gilt die oberste Quelle. Was du selbst von Hand geändert hast, geht immer vor."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      {sources.length === 0 ? (
        <p className="muted">Du hast noch keine Kontakte übernommen.</p>
      ) : (
        <ul className="list">
          {sources.map((source, index) => {
            const count = counts.get(source.id) ?? 0;
            return (
              <li className="group" key={source.id} style={{ padding: 'var(--s-4)' }}>
                <p className="strong">{source.name}</p>
                <p className="small muted">
                  {[
                    count === 1 ? '1 Kontakt' : `${count} Kontakte`,
                    source.lastImportAt ? `zuletzt am ${formatDate(source.lastImportAt)}` : '',
                    index === 0 && sources.length > 1 ? 'gilt bei Abweichungen' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="actions" style={{ marginTop: 'var(--s-3)' }}>
                  {index > 0 && (
                    <button type="button" className="btn" onClick={() => store.setLeadingSource(source.id)}>
                      Soll bei Abweichungen gelten
                    </button>
                  )}
                  <button type="button" className="btn btn-danger" onClick={() => setUndo(source)}>
                    Zurücknehmen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={undo !== null}
        title={undo ? `Import aus ${undo.name} zurücknehmen?` : ''}
        confirmLabel="Import zurücknehmen"
        danger
        onConfirm={confirmUndo}
        onCancel={() => setUndo(null)}
      >
        <p>Alle Angaben aus dieser Quelle werden von diesem Gerät entfernt.</p>
        <p>
          <strong>{preview.removed === 1 ? '1 Eintrag' : `${preview.removed} Einträge`}</strong> stammen nur aus dieser
          Quelle und werden samt deinen Notizen dazu gelöscht.{' '}
          {preview.kept > 0 &&
            `${preview.kept === 1 ? '1 Kontakt behält' : `${preview.kept} Kontakte behalten`} die Angaben aus anderen Quellen.`}
        </p>
        <p className="small muted">Das lässt sich nicht rückgängig machen. Du kannst die Kontakte aber erneut übernehmen.</p>
      </ConfirmDialog>
    </Page>
  );
};
