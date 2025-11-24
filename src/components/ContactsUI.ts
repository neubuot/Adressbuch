import type { Contact } from '../types';
import { contactService } from '../services/contacts';
import { escapeHtml, showStatus } from '../utils/dom';

/**
 * Contacts UI component
 */
export class ContactsUI {
  /**
   * Renders the contact list
   */
  render(): void {
    const container = document.getElementById('contactsList');
    if (!container) return;

    const contacts = contactService.getAll();

    if (contacts.length === 0) {
      container.innerHTML = '<div class="empty-state">Keine Kontakte vorhanden</div>';
      return;
    }

    container.innerHTML = contacts
      .map(contact => this.renderContactItem(contact))
      .join('');
  }

  /**
   * Renders a single contact item
   */
  private renderContactItem(contact: Contact): string {
    return `
      <div class="contact-item">
        <div class="contact-header">
          <div class="contact-name">${escapeHtml(contact.name)}</div>
          <div class="contact-actions">
            <button class="btn-secondary" data-action="compose" data-contact-id="${contact.id}">
              ✉️ Nachricht
            </button>
            <button class="btn-danger" data-action="delete" data-contact-id="${contact.id}">
              🗑️ Löschen
            </button>
          </div>
        </div>
        <div class="contact-details">
          <div>📧 ${escapeHtml(contact.email)}</div>
          ${contact.phone ? `<div>📱 ${escapeHtml(contact.phone)}</div>` : ''}
          ${contact.address ? `<div>📍 ${escapeHtml(contact.address)}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Sets up event listeners for the contact form
   */
  setupFormListener(onContactAdded: () => void): void {
    const form = document.getElementById('contactForm') as HTMLFormElement;
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit(onContactAdded);
    });
  }

  /**
   * Handles contact form submission
   */
  private handleFormSubmit(onContactAdded: () => void): void {
    const name = (document.getElementById('contactName') as HTMLInputElement).value.trim();
    const email = (document.getElementById('contactEmail') as HTMLInputElement).value.trim();
    const phone = (document.getElementById('contactPhone') as HTMLInputElement).value.trim();
    const address = (document.getElementById('contactAddress') as HTMLTextAreaElement).value.trim();

    if (!name || !email) {
      showStatus('Bitte Name und E-Mail eingeben', true);
      return;
    }

    contactService.add({ name, email, phone, address });

    const form = document.getElementById('contactForm') as HTMLFormElement;
    form.reset();

    onContactAdded();
  }

  /**
   * Updates the recipient select dropdown
   */
  updateRecipientSelect(): void {
    const select = document.getElementById('messageRecipient') as HTMLSelectElement;
    if (!select) return;

    const currentValue = select.value;
    const contacts = contactService.getAll();

    select.innerHTML =
      '<option value="">Empfänger wählen...</option>' +
      contacts
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');

    if (currentValue) {
      select.value = currentValue;
    }
  }
}
