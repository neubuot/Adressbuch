/**
 * Haupt-App-Komponente
 */

import { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Dashboard } from './components/Dashboard';
import { MyCard } from './components/MyCard';
import { Connections } from './components/Connections';
import { PolicyEditor } from './components/PolicyEditor';
import { Messages } from './components/Messages';
import './App.css';

type View = 'dashboard' | 'mycard' | 'connections' | 'policy' | 'messages';

function AppContent() {
  const { appState } = useAppContext();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Erstelle dynamischen Titel
  const firstName = appState.myCard.firstName || '';
  const lastName = appState.myCard.lastName || '';
  const nameExtension = (firstName || lastName) ? ` von ${firstName} ${lastName}`.trim() : '';
  const appTitle = `P2P Adressbuch${nameExtension}`;

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentView} />;
      case 'mycard':
        return <MyCard onBack={() => setCurrentView('dashboard')} />;
      case 'connections':
        return (
          <Connections
            onBack={() => setCurrentView('dashboard')}
            onEditPolicy={(connectionId) => {
              setSelectedConnectionId(connectionId);
              setCurrentView('policy');
            }}
          />
        );
      case 'messages':
        return <Messages onBack={() => setCurrentView('dashboard')} />;
      case 'policy':
        return (
          <PolicyEditor
            connectionId={selectedConnectionId}
            onBack={() => setCurrentView('connections')}
          />
        );
      default:
        return <Dashboard onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>{appTitle}</h1>
        <nav>
          <button
            onClick={() => setCurrentView('dashboard')}
            className={currentView === 'dashboard' ? 'active' : ''}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('mycard')}
            className={currentView === 'mycard' ? 'active' : ''}
          >
            Meine Adresse
          </button>
          <button
            onClick={() => setCurrentView('connections')}
            className={currentView === 'connections' ? 'active' : ''}
          >
            Verbindungen
          </button>
          <button
            onClick={() => setCurrentView('messages')}
            className={currentView === 'messages' ? 'active' : ''}
          >
            💬 Nachrichten
          </button>
        </nav>
      </header>
      <main className="app-main">{renderView()}</main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
