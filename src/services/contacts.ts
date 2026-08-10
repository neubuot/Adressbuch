import type { Contact } from '../types';
import { storageService } from './storage';
import { showStatus } from '../utils/dom';

/**
 * Contact management service
 */
class ContactService {
  private contacts: Contact[] = [];

  constructor() {
    this.contacts = storageService.loadContacts();
  }

  /**
   * Gets all contacts
   */
  getAll(): Contact[] {
    return this.contacts;
  }

  /**
   * Finds a contact by ID
   */
  findById(id: number): Contact | undefined {
    return this.contacts.find(c => c.id === id);
  }

  /**
   * Adds a new contact
   */
  add(contactData: Omit<Contact, 'id' | 'createdAt'>): Contact {
    const contact: Contact = {
      id: Date.now(),
      ...contactData,
      createdAt: new Date().toISOString()
    };

    this.contacts.push(contact);
    storageService.saveContacts(this.contacts);
    showStatus('Kontakt hinzugefügt ✓', false);

    return contact;
  }

  /**
   * Deletes a contact
   */
  delete(id: number): boolean {
    if (!confirm('Kontakt wirklich löschen?')) {
      return false;
    }

    this.contacts = this.contacts.filter(c => c.id !== id);
    storageService.saveContacts(this.contacts);
    showStatus('Kontakt gelöscht', false);

    return true;
  }

  /**
   * Reloads contacts from storage
   */
  reload(): void {
    this.contacts = storageService.loadContacts();
  }
}

export const contactService = new ContactService();
