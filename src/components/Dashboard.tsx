/**
 * Dashboard-Komponente
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { getP2PManager } from '../p2p/p2p-manager';
import { ExportImport } from './ExportImport';

interface DashboardProps {
  onNavigate: (view: 'mycard' | 'connections') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { appState, isInitialized } = useAppContext();
  const [showExportImport, setShowExportImport] = useState(false);

  if (!isInitialized) {
    return <div className="loading">Laden...</div>;
  }

  const manager = getP2PManager();
  const connectionCount = Object.keys(appState.connections).length;
  const onlineCount = Object.values(appState.connections).filter(
    (c) => c.status === 'online'
  ).length;

  const { myCard } = appState;
  const isProfileComplete =
    myCard.firstName && myCard.lastName && myCard.email;

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Dashboard</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Mein Profil</h3>
          {isProfileComplete ? (
            <>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                {myCard.firstName} {myCard.lastName}
                <br />
                {myCard.email}
              </p>
              <button className="btn btn-secondary btn-small" onClick={() => onNavigate('mycard')}>
                Bearbeiten
              </button>
            </>
          ) : (
            <>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Profil noch nicht vollständig
              </p>
              <button className="btn btn-primary btn-small" onClick={() => onNavigate('mycard')}>
                Profil vervollständigen
              </button>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Verbindungen</h3>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            {connectionCount} Verbindungen ({onlineCount} online)
          </p>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => onNavigate('connections')}
          >
            Verwalten
          </button>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>Teilen & Backup</h3>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Visitenkarte per QR-Code teilen oder als JSON exportieren
          </p>
          <button
            className="btn btn-primary btn-small"
            onClick={() => setShowExportImport(true)}
          >
            📤 Export / Import
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Geräteinformationen</h3>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Peer-ID:</strong> <code>{manager?.getLocalPeerId()}</code>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Status:</strong>{' '}
            <span className="status-indicator online">
              <span className="status-dot" />
              Online
            </span>
          </div>
        </div>
      </div>

      {connectionCount === 0 && (
        <div className="card" style={{ marginTop: '2rem', backgroundColor: '#fef3c7' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>🚀 Erste Schritte</h3>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Verbinde dich mit anderen Nutzern, um deine Adresskarte zu teilen:
          </p>
          <ol style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
            <li>Vervollständige dein Profil unter "Meine Adresse"</li>
            <li>Gehe zu "Verbindungen" und erstelle eine neue Verbindung</li>
            <li>Teile den Verbindungscode mit einem anderen Nutzer</li>
          </ol>
        </div>
      )}

      {showExportImport && <ExportImport onClose={() => setShowExportImport(false)} />}
    </div>
  );
};
