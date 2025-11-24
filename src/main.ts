import './styles.css';
import { ContactsUI } from './components/ContactsUI';
import { MessagesUI } from './components/MessagesUI';
import { pwaService } from './services/pwa';
import { contactService } from './services/contacts';
import { messageService } from './services/messages';
import { dataSyncService } from './services/dataSync';

/**
 * Main application class
 */
class AddressBookApp {
  private contactsUI: ContactsUI;
  private messagesUI: MessagesUI;

  constructor() {
    this.contactsUI = new ContactsUI();
    this.messagesUI = new MessagesUI();
  }

  /**
   * Initializes the application
   */
  init(): void {
    // Initialize PWA features
    pwaService.init();

    // Setup UI components
    this.setupTabs();
    this.setupEventListeners();
    this.setupEventDelegation();

    // Initial render
    this.renderAll();
  }

  /**
   * Sets up tab navigation
   */
  private setupTabs(): void {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tab = target.dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }

  /**
   * Switches to a different tab
   */
  private switchTab(tabName: string): void {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const btnTab = (btn as HTMLElement).dataset.tab;
      btn.classList.toggle('active', btnTab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
      targetTab.classList.add('active');
    }
  }

  /**
   * Sets up all event listeners
   */
  private setupEventListeners(): void {
    // Contact form
    this.contactsUI.setupFormListener(() => {
      this.contactsUI.render();
      this.contactsUI.updateRecipientSelect();
    });

    // Message form
    this.messagesUI.setupFormListener(() => {
      this.messagesUI.render();
    });

    // Message filters
    this.messagesUI.setupFilterListeners();
  }

  /**
   * Sets up event delegation for dynamic elements
   */
  private setupEventDelegation(): void {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Handle contact delete
      if (target.dataset.action === 'delete') {
        const contactId = parseInt(target.dataset.contactId || '0');
        if (contactService.delete(contactId)) {
          this.contactsUI.render();
          this.contactsUI.updateRecipientSelect();
        }
      }

      // Handle compose message
      if (target.dataset.action === 'compose') {
        const contactId = parseInt(target.dataset.contactId || '0');
        this.messagesUI.composeMessage(contactId, (tab) => this.switchTab(tab));
      }

      // Handle message delete
      if (target.dataset.action === 'delete-message') {
        const messageId = parseInt(target.dataset.messageId || '0');
        if (messageService.delete(messageId)) {
          this.messagesUI.render();
        }
      }
    });
  }

  /**
   * Renders all UI components
   */
  private renderAll(): void {
    this.contactsUI.render();
    this.contactsUI.updateRecipientSelect();
    this.messagesUI.render();
  }

  /**
   * Exports all app data (for console use)
   */
  exportData() {
    const data = dataSyncService.exportData();
    console.log('Exportierte Daten:', JSON.stringify(data));
    return data;
  }

  /**
   * Imports app data (for console use)
   */
  importData(data: any) {
    dataSyncService.importData(data, () => this.renderAll());
  }
}

// Initialize app when DOM is ready
let app: AddressBookApp;

document.addEventListener('DOMContentLoaded', () => {
  app = new AddressBookApp();
  app.init();
});

// Make export/import available in console for P2P sync
(window as any).exportAddressBookData = () => {
  return app?.exportData();
};

(window as any).importAddressBookData = (data: any) => {
  app?.importData(data);
};
