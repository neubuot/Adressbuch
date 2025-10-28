/**
 * PolicyEditor-Komponente: Bearbeitung von Freigabe-Policies
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { getP2PManager } from '../p2p/p2p-manager';
import { ADDRESS_CARD_FIELDS } from '../types';
import { getFieldLabel, POLICY_PRESETS, projectFields } from '../utils/policy';

interface PolicyEditorProps {
  connectionId: string | null;
  onBack: () => void;
}

export const PolicyEditor: React.FC<PolicyEditorProps> = ({ connectionId, onBack }) => {
  const { appState } = useAppContext();

  if (!connectionId) {
    return (
      <div>
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          ← Zurück
        </button>
        <p>Keine Verbindung ausgewählt</p>
      </div>
    );
  }

  const connection = appState.connections[connectionId];

  if (!connection) {
    return (
      <div>
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          ← Zurück
        </button>
        <p>Verbindung nicht gefunden</p>
      </div>
    );
  }

  const [allowedFields, setAllowedFields] = useState<string[]>(connection.allowedFields);
  const [isSaving, setIsSaving] = useState(false);

  const handleFieldToggle = (field: string) => {
    if (allowedFields.includes(field)) {
      setAllowedFields(allowedFields.filter((f) => f !== field));
    } else {
      setAllowedFields([...allowedFields, field]);
    }
  };

  const handlePresetSelect = (preset: keyof typeof POLICY_PRESETS) => {
    setAllowedFields([...POLICY_PRESETS[preset]]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await store.updateConnection(connectionId, {
        allowedFields,
      });

      // Trigger Resync
      const manager = getP2PManager();
      if (manager) {
        await manager.resyncConnection(connectionId);
      }

      alert('Policy gespeichert und synchronisiert');
      onBack();
    } catch (error) {
      console.error('Fehler beim Speichern', error);
      alert('Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  // Vorschau der geteilten Daten
  const sharedData = projectFields(appState.myCard, allowedFields);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          ← Zurück
        </button>
        <h2 style={{ marginLeft: '1rem' }}>
          Freigabe bearbeiten: {connection.label || connection.id.substring(0, 8)}
        </h2>
      </div>

      <div className="grid grid-2" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Freizugebende Felder</h3>

          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.875rem' }}>Vorlagen:</strong>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePresetSelect('none')}
              >
                Keine
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePresetSelect('minimal')}
              >
                Minimal
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePresetSelect('business')}
              >
                Geschäftlich
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePresetSelect('address')}
              >
                Adresse
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handlePresetSelect('full')}
              >
                Alle
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ADDRESS_CARD_FIELDS.map((field) => (
              <label
                key={field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  borderRadius: '0.25rem',
                  backgroundColor: allowedFields.includes(field)
                    ? 'var(--background)'
                    : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={allowedFields.includes(field)}
                  onChange={() => handleFieldToggle(field)}
                />
                <span>{getFieldLabel(field)}</span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Speichern...' : 'Speichern & Synchronisieren'}
            </button>
            <button className="btn btn-secondary" onClick={onBack}>
              Abbrechen
            </button>
          </div>
        </div>

        <div className="card" style={{ backgroundColor: '#f0f9ff' }}>
          <h3 style={{ marginBottom: '1rem' }}>Vorschau: Das sieht der andere</h3>

          {allowedFields.length === 0 ? (
            <div className="empty-state">
              <p>Keine Felder freigegeben</p>
            </div>
          ) : (
            <div style={{ fontSize: '0.875rem' }}>
              {Object.entries(sharedData).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    marginBottom: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: 'white',
                    borderRadius: '0.25rem',
                  }}
                >
                  <strong>{getFieldLabel(key)}:</strong> {typeof value === 'object' ? JSON.stringify(value) : (value || '(leer)')}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ backgroundColor: '#fef3c7' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>ℹ️ Hinweis</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Änderungen an der Freigabe werden sofort mit dem verbundenen Peer synchronisiert. Der
          andere Nutzer sieht nur die Felder, die du hier auswählst.
        </p>
      </div>
    </div>
  );
};
