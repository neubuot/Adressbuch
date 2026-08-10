import type { Message, MessageFilter } from '../types';
import { storageService } from './storage';
import { contactService } from './contacts';
import { showStatus } from '../utils/dom';

/**
 * Message management service
 */
class MessageService {
  private messages: Message[] = [];

  constructor() {
    this.messages = storageService.loadMessages();
  }

  /**
   * Gets all messages
   */
  getAll(): Message[] {
    return this.messages;
  }

  /**
   * Gets filtered messages
   */
  getFiltered(filter: MessageFilter): Message[] {
    if (filter === 'all') {
      return this.messages;
    }
    return this.messages.filter(m => m.type === filter);
  }

  /**
   * Sends a new message
   */
  send(recipientId: number, text: string): Message | null {
    if (!text.trim()) {
      showStatus('Bitte Nachricht eingeben', true);
      return null;
    }

    if (text.length > 210) {
      showStatus('Nachricht zu lang (max. 210 Zeichen)', true);
      return null;
    }

    const recipient = contactService.findById(recipientId);
    if (!recipient) {
      showStatus('Empfänger nicht gefunden', true);
      return null;
    }

    const message: Message = {
      id: Date.now(),
      recipientId,
      recipientName: recipient.name,
      text: text.trim(),
      type: 'sent',
      timestamp: new Date().toISOString(),
      read: false
    };

    this.messages.push(message);
    storageService.saveMessages(this.messages);

    // Simulate P2P delivery
    this.simulateP2PDelivery(message);

    showStatus('Nachricht gesendet ✓', false);
    return message;
  }

  /**
   * Deletes a message
   */
  delete(id: number): boolean {
    if (!confirm('Nachricht wirklich löschen?')) {
      return false;
    }

    this.messages = this.messages.filter(m => m.id !== id);
    storageService.saveMessages(this.messages);
    showStatus('Nachricht gelöscht', false);

    return true;
  }

  /**
   * Simulates P2P message delivery
   * In a real implementation, this would use WebRTC
   */
  private simulateP2PDelivery(message: Message): void {
    setTimeout(() => {
      console.log('P2P Nachricht zugestellt:', message);
    }, 2000);
  }

  /**
   * Reloads messages from storage
   */
  reload(): void {
    this.messages = storageService.loadMessages();
  }
}

export const messageService = new MessageService();
