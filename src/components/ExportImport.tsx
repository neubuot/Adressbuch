/**
 * ExportImport-Komponente: Export/Import von Visitenkarten
 */

import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { getP2PManager } from '../p2p/p2p-manager';
import QRCode from 'qrcode';
import type { AddressCard } from '../types';

interface ExportImportProps {
  onClose: () => void;
}

interface ExportData {
  version: '1.0';
  type: 'vcard';
  pubKey: string;
  roomCode?: string;
  card: Partial<AddressCard>;
  allowedFields: string[];
}

export const ExportImport: React.FC<ExportImportProps> = ({ onClose }) => {
  const { appState } = useAppContext();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'firstName',
    'lastName',
    'email',
  ]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const availableFields = [
    { key: 'firstName', label: 'Vorname' },
    { key: 'lastName', label: 'Nachname' },
    { key: 'email', label: 'E-Mail' },
    { key: 'phone', label: 'Telefon' },
    { key: 'street', label: 'Straße' },
    { key: 'postalCode', label: 'PLZ' },
    { key: 'city', label: 'Stadt' },
    { key: 'country', label: 'Land' },
    { key: 'birthday', label: 'Geburtstag' },
    { key: 'organization', label: 'Organisation' },
  ];

  const toggleField = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter((f) => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const generateRoomCode = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setRoomCode(code);
    return code;
  };

  const generateQRCode = async () => {
    const manager = getP2PManager();
    if (!manager) return;

    const pubKey = await (manager as any).cryptoManager.exportPublicKey();
    const code = roomCode || generateRoomCode();

    // Erstelle Export-Daten
    const exportData: ExportData = {
      version: '1.0',
      type: 'vcard',
      pubKey,
      roomCode: code,
      card: {},
      allowedFields: selectedFields,
    };

    // Füge nur ausgewählte Felder hinzu
    for (const field of selectedFields) {
      const value = (appState.myCard as any)[field];
      if (value) {
        (exportData.card as any)[field] = value;
      }
    }

    // Generiere QR-Code
    const dataString = JSON.stringify(exportData);
    try {
      const url = await QRCode.toDataURL(dataString, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeUrl(url);

      // Trete dem Room bei (für automatische Verbindung)
      manager.setDefaultAllowedFields(selectedFields);
      manager.createRoom(code);
    } catch (error) {
      console.error('Fehler beim Generieren des QR-Codes:', error);
    }
  };

  const downloadJSON = () => {
    const exportData = {
      myCard: appState.myCard,
      exportedAt: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `visitenkarte-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.myCard) {
        // Import eigene Karte
        await store.updateMyCard(data.myCard);
        alert('Visitenkarte erfolgreich importiert!');
      } else if (data.type === 'vcard' && data.pubKey) {
        // Import fremde Karte via QR-Code Daten
        const manager = getP2PManager();
        if (manager && data.roomCode) {
          manager.setDefaultAllowedFields(selectedFields);
          manager.joinRoom(data.roomCode);
          alert(`Verbindung wird hergestellt mit Raum: ${data.roomCode}`);
        }
      } else {
        alert('Ungültiges Datenformat');
      }
    } catch (error) {
      console.error('Fehler beim Importieren:', error);
      alert('Fehler beim Importieren der Datei');
    }
  };

  useEffect(() => {
    if (activeTab === 'export' && selectedFields.length > 0) {
      generateQRCode();
    }
  }, [selectedFields, activeTab]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '700px',
          width: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Export / Import</h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            ✕ Schließen
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border)' }}>
          <button
            className={`btn ${activeTab === 'export' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('export')}
            style={{ borderRadius: '0.375rem 0.375rem 0 0' }}
          >
            📤 Export
          </button>
          <button
            className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('import')}
            style={{ borderRadius: '0.375rem 0.375rem 0 0' }}
          >
            📥 Import
          </button>
        </div>

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Visitenkarte teilen</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Generiere einen QR-Code oder exportiere deine Visitenkarte als JSON.
              Andere Personen können damit direkt mit dir verbinden.
            </p>

            {/* Feld-Auswahl */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Welche Felder möchtest du teilen?</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
                {availableFields.map((field) => (
                  <label
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      backgroundColor: selectedFields.includes(field.key) ? 'var(--primary-light)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field.key)}
                      onChange={() => toggleField(field.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* QR-Code */}
            {qrCodeUrl && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem', textAlign: 'center' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>QR-Code zum Scannen</h4>
                <img src={qrCodeUrl} alt="QR-Code" style={{ maxWidth: '300px', width: '100%' }} />
                <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  <strong>Raum-Code:</strong> {roomCode}
                  <br />
                  <span style={{ fontSize: '0.75rem' }}>
                    Andere können diesen Code auch manuell eingeben
                  </span>
                </div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={generateQRCode}
                  style={{ marginTop: '1rem' }}
                >
                  🔄 Neuen Code generieren
                </button>
              </div>
            )}

            {/* JSON Export */}
            <div style={{ padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Als JSON exportieren</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Exportiere deine vollständige Visitenkarte als JSON-Datei für Backup oder Import auf einem anderen Gerät.
              </p>
              <button className="btn btn-primary" onClick={downloadJSON}>
                💾 JSON herunterladen
              </button>
            </div>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Visitenkarte importieren</h3>

            {/* QR-Code Scanner Placeholder */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>📷 QR-Code scannen</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Scanne einen QR-Code einer anderen Person um automatisch eine Verbindung herzustellen.
              </p>
              <div style={{ padding: '2rem', border: '2px dashed var(--border)', borderRadius: '0.375rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  QR-Code Scanner wird in einem zukünftigen Update verfügbar sein.
                  <br />
                  Alternativ: Lade ein Screenshot des QR-Codes als JSON hoch.
                </p>
              </div>
            </div>

            {/* JSON Import */}
            <div style={{ padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>📁 JSON hochladen</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Importiere eine Visitenkarte aus einer JSON-Datei.
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                style={{ fontSize: '0.875rem' }}
              />
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
};
