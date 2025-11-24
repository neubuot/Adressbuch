import type { AppData } from '../types';
import { contactService } from './contacts';
import { messageService } from './messages';
import { storageService } from './storage';
import { showStatus } from '../utils/dom';

/**
 * Data export/import service for P2P sync
 */
class DataSyncService {
  /**
   * Exports all app data
   */
  exportData(): AppData {
    return {
      contacts: contactService.getAll(),
      messages: messageService.getAll(),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Imports app data
   */
  importData(data: AppData, onImported: () => void): void {
    if (!confirm('Daten importieren? Dies überschreibt vorhandene Daten.')) {
      return;
    }

    storageService.saveContacts(data.contacts || []);
    storageService.saveMessages(data.messages || []);

    contactService.reload();
    messageService.reload();

    onImported();
    showStatus('Daten importiert ✓', false);
  }

  /**
   * Clears all app data
   */
  clearAll(onCleared: () => void): void {
    if (!confirm('Alle Daten wirklich löschen?')) {
      return;
    }

    storageService.clearAll();
    contactService.reload();
    messageService.reload();

    onCleared();
    showStatus('Alle Daten gelöscht', false);
  }
}

export const dataSyncService = new DataSyncService();
