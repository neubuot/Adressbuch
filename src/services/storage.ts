import type { Contact, Message } from '../types';

/**
 * Generic storage service using LocalStorage
 */
class StorageService {
  /**
   * Loads contacts from LocalStorage
   */
  loadContacts(): Contact[] {
    const contacts = localStorage.getItem('contacts');
    return contacts ? JSON.parse(contacts) : [];
  }

  /**
   * Saves contacts to LocalStorage
   */
  saveContacts(contacts: Contact[]): void {
    localStorage.setItem('contacts', JSON.stringify(contacts));
  }

  /**
   * Loads messages from LocalStorage
   */
  loadMessages(): Message[] {
    const messages = localStorage.getItem('messages');
    return messages ? JSON.parse(messages) : [];
  }

  /**
   * Saves messages to LocalStorage
   */
  saveMessages(messages: Message[]): void {
    localStorage.setItem('messages', JSON.stringify(messages));
  }

  /**
   * Clears all data from LocalStorage
   */
  clearAll(): void {
    localStorage.removeItem('contacts');
    localStorage.removeItem('messages');
  }
}

export const storageService = new StorageService();
