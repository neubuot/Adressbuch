import { describe, it, expect, beforeEach } from 'vitest';
import { storageService } from '../../src/services/storage';
import type { Contact, Message } from '../../src/types';

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Contacts', () => {
    it('should load empty contacts array initially', () => {
      const contacts = storageService.loadContacts();
      expect(contacts).toEqual([]);
    });

    it('should save and load contacts', () => {
      const testContacts: Contact[] = [
        {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          phone: '1234567890',
          address: '123 Main St',
          createdAt: new Date().toISOString()
        }
      ];

      storageService.saveContacts(testContacts);
      const loaded = storageService.loadContacts();

      expect(loaded).toEqual(testContacts);
    });
  });

  describe('Messages', () => {
    it('should load empty messages array initially', () => {
      const messages = storageService.loadMessages();
      expect(messages).toEqual([]);
    });

    it('should save and load messages', () => {
      const testMessages: Message[] = [
        {
          id: 1,
          recipientId: 1,
          recipientName: 'John Doe',
          text: 'Hello!',
          type: 'sent',
          timestamp: new Date().toISOString(),
          read: false
        }
      ];

      storageService.saveMessages(testMessages);
      const loaded = storageService.loadMessages();

      expect(loaded).toEqual(testMessages);
    });
  });

  describe('Clear All', () => {
    it('should clear all data from storage', () => {
      const testContact: Contact = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date().toISOString()
      };

      const testMessage: Message = {
        id: 1,
        recipientId: 1,
        recipientName: 'John Doe',
        text: 'Hello!',
        type: 'sent',
        timestamp: new Date().toISOString(),
        read: false
      };

      storageService.saveContacts([testContact]);
      storageService.saveMessages([testMessage]);

      storageService.clearAll();

      expect(storageService.loadContacts()).toEqual([]);
      expect(storageService.loadMessages()).toEqual([]);
    });
  });
});
