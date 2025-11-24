import type { Message, MessageFilter } from '../types';
import { messageService } from '../services/messages';
import { escapeHtml, showStatus } from '../utils/dom';

/**
 * Messages UI component
 */
export class MessagesUI {
  private currentFilter: MessageFilter = 'all';

  /**
   * Renders the message list
   */
  render(): void {
    const container = document.getElementById('messagesList');
    if (!container) return;

    const messages = messageService.getFiltered(this.currentFilter);

    // Sort by timestamp, newest first
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (sortedMessages.length === 0) {
      container.innerHTML = '<div class="empty-state">Keine Nachrichten vorhanden</div>';
      return;
    }

    container.innerHTML = sortedMessages
      .map(msg => this.renderMessageItem(msg))
      .join('');
  }

  /**
   * Renders a single message item
   */
  private renderMessageItem(msg: Message): string {
    const date = new Date(msg.timestamp);
    const formattedDate = date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="message-item ${msg.type}">
        <div class="message-header">
          <span class="message-recipient">
            ${msg.type === 'sent' ? '→' : '←'} ${escapeHtml(msg.recipientName)}
          </span>
          <span>${formattedDate} ${formattedTime}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.text)}</div>
        <div class="message-footer">
          <button class="btn-danger" data-action="delete-message" data-message-id="${msg.id}">
            🗑️ Löschen
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Sets up event listeners for the message form
   */
  setupFormListener(onMessageSent: () => void): void {
    const form = document.getElementById('messageForm') as HTMLFormElement;
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit(onMessageSent);
    });

    // Character counter
    const messageText = document.getElementById('messageText') as HTMLTextAreaElement;
    const charCount = document.getElementById('charCount');

    if (messageText && charCount) {
      messageText.addEventListener('input', () => {
        const count = messageText.value.length;
        charCount.textContent = count.toString();

        if (count >= 200) {
          charCount.style.color = 'var(--danger-color)';
        } else {
          charCount.style.color = 'var(--text-secondary)';
        }
      });
    }
  }

  /**
   * Handles message form submission
   */
  private handleFormSubmit(onMessageSent: () => void): void {
    const recipientId = parseInt(
      (document.getElementById('messageRecipient') as HTMLSelectElement).value
    );
    const text = (document.getElementById('messageText') as HTMLTextAreaElement).value;

    if (!recipientId) {
      showStatus('Bitte Empfänger wählen', true);
      return;
    }

    const message = messageService.send(recipientId, text);

    if (message) {
      const form = document.getElementById('messageForm') as HTMLFormElement;
      form.reset();

      const charCount = document.getElementById('charCount');
      if (charCount) {
        charCount.textContent = '0';
      }

      onMessageSent();
    }
  }

  /**
   * Sets up filter button listeners
   */
  setupFilterListeners(): void {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const filter = target.dataset.filter as MessageFilter;

        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');

        this.currentFilter = filter;
        this.render();
      });
    });
  }

  /**
   * Switches to message tab and focuses recipient for a specific contact
   */
  composeMessage(contactId: number, switchTab: (tab: string) => void): void {
    switchTab('messages');

    const select = document.getElementById('messageRecipient') as HTMLSelectElement;
    const textArea = document.getElementById('messageText') as HTMLTextAreaElement;

    if (select) {
      select.value = contactId.toString();
    }

    if (textArea) {
      textArea.focus();
    }
  }
}
