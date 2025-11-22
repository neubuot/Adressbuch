// Progressive Web App - Dezentrales Adressbuch mit P2P Messaging
class AddressBook {
    constructor() {
        this.contacts = this.loadContacts();
        this.messages = this.loadMessages();
        this.currentFilter = 'all';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderContacts();
        this.renderMessages();
        this.updateRecipientSelect();
        this.setupPWA();
    }

    // === PWA Setup ===
    setupPWA() {
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registriert:', reg))
                .catch(err => console.error('Service Worker Fehler:', err));
        }

        // Install Button
        let deferredPrompt;
        const installBtn = document.getElementById('installBtn');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'block';
        });

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`Installation: ${outcome}`);
                deferredPrompt = null;
                installBtn.style.display = 'none';
            }
        });

        // Online/Offline Status
        window.addEventListener('online', () => {
            this.showStatus('Online - Verbunden', false);
        });

        window.addEventListener('offline', () => {
            this.showStatus('Offline-Modus aktiv', true);
        });
    }

    // === Event Listeners ===
    setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Contact Form
        document.getElementById('contactForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addContact();
        });

        // Message Form
        document.getElementById('messageForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        // Character Counter
        const messageText = document.getElementById('messageText');
        const charCount = document.getElementById('charCount');
        messageText.addEventListener('input', () => {
            charCount.textContent = messageText.value.length;
            if (messageText.value.length >= 200) {
                charCount.style.color = 'var(--danger-color)';
            } else {
                charCount.style.color = 'var(--text-secondary)';
            }
        });

        // Message Filter
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.renderMessages();
            });
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    // === Contact Management ===
    loadContacts() {
        const contacts = localStorage.getItem('contacts');
        return contacts ? JSON.parse(contacts) : [];
    }

    saveContacts() {
        localStorage.setItem('contacts', JSON.stringify(this.contacts));
    }

    addContact() {
        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const phone = document.getElementById('contactPhone').value.trim();
        const address = document.getElementById('contactAddress').value.trim();

        if (!name || !email) {
            this.showStatus('Bitte Name und E-Mail eingeben', true);
            return;
        }

        const contact = {
            id: Date.now(),
            name,
            email,
            phone,
            address,
            createdAt: new Date().toISOString()
        };

        this.contacts.push(contact);
        this.saveContacts();
        this.renderContacts();
        this.updateRecipientSelect();
        document.getElementById('contactForm').reset();
        this.showStatus('Kontakt hinzugefügt ✓', false);
    }

    deleteContact(id) {
        if (confirm('Kontakt wirklich löschen?')) {
            this.contacts = this.contacts.filter(c => c.id !== id);
            this.saveContacts();
            this.renderContacts();
            this.updateRecipientSelect();
            this.showStatus('Kontakt gelöscht', false);
        }
    }

    renderContacts() {
        const container = document.getElementById('contactsList');

        if (this.contacts.length === 0) {
            container.innerHTML = '<div class="empty-state">Keine Kontakte vorhanden</div>';
            return;
        }

        container.innerHTML = this.contacts.map(contact => `
            <div class="contact-item">
                <div class="contact-header">
                    <div class="contact-name">${this.escapeHtml(contact.name)}</div>
                    <div class="contact-actions">
                        <button class="btn-secondary" onclick="app.composeMessage(${contact.id})">
                            ✉️ Nachricht
                        </button>
                        <button class="btn-danger" onclick="app.deleteContact(${contact.id})">
                            🗑️ Löschen
                        </button>
                    </div>
                </div>
                <div class="contact-details">
                    <div>📧 ${this.escapeHtml(contact.email)}</div>
                    ${contact.phone ? `<div>📱 ${this.escapeHtml(contact.phone)}</div>` : ''}
                    ${contact.address ? `<div>📍 ${this.escapeHtml(contact.address)}</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    updateRecipientSelect() {
        const select = document.getElementById('messageRecipient');
        const currentValue = select.value;

        select.innerHTML = '<option value="">Empfänger wählen...</option>' +
            this.contacts.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');

        if (currentValue) {
            select.value = currentValue;
        }
    }

    composeMessage(contactId) {
        this.switchTab('messages');
        document.getElementById('messageRecipient').value = contactId;
        document.getElementById('messageText').focus();
    }

    // === Message Management ===
    loadMessages() {
        const messages = localStorage.getItem('messages');
        return messages ? JSON.parse(messages) : [];
    }

    saveMessages() {
        localStorage.setItem('messages', JSON.stringify(this.messages));
    }

    sendMessage() {
        const recipientId = parseInt(document.getElementById('messageRecipient').value);
        const text = document.getElementById('messageText').value.trim();

        if (!recipientId || !text) {
            this.showStatus('Bitte Empfänger und Nachricht eingeben', true);
            return;
        }

        if (text.length > 210) {
            this.showStatus('Nachricht zu lang (max. 210 Zeichen)', true);
            return;
        }

        const recipient = this.contacts.find(c => c.id === recipientId);
        if (!recipient) {
            this.showStatus('Empfänger nicht gefunden', true);
            return;
        }

        const message = {
            id: Date.now(),
            recipientId,
            recipientName: recipient.name,
            text,
            type: 'sent',
            timestamp: new Date().toISOString(),
            read: false
        };

        this.messages.push(message);
        this.saveMessages();

        // Simulate P2P: In a real P2P system, this would be sent via WebRTC
        // For now, we store locally as a demo
        this.simulateP2PDelivery(message);

        this.renderMessages();
        document.getElementById('messageForm').reset();
        document.getElementById('charCount').textContent = '0';
        this.showStatus('Nachricht gesendet ✓', false);
    }

    simulateP2PDelivery(message) {
        // In einer echten P2P-Implementierung würde hier WebRTC verwendet werden
        // Für die Demo simulieren wir eine Zustellung nach 2 Sekunden
        setTimeout(() => {
            console.log('P2P Nachricht zugestellt:', message);
            // Hier könnte man einen Zustellstatus aktualisieren
        }, 2000);
    }

    deleteMessage(id) {
        if (confirm('Nachricht wirklich löschen?')) {
            this.messages = this.messages.filter(m => m.id !== id);
            this.saveMessages();
            this.renderMessages();
            this.showStatus('Nachricht gelöscht', false);
        }
    }

    renderMessages() {
        const container = document.getElementById('messagesList');

        let filteredMessages = this.messages;
        if (this.currentFilter !== 'all') {
            filteredMessages = this.messages.filter(m => m.type === this.currentFilter);
        }

        // Sort by timestamp, newest first
        filteredMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (filteredMessages.length === 0) {
            container.innerHTML = '<div class="empty-state">Keine Nachrichten vorhanden</div>';
            return;
        }

        container.innerHTML = filteredMessages.map(msg => {
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
                            ${msg.type === 'sent' ? '→' : '←'} ${this.escapeHtml(msg.recipientName)}
                        </span>
                        <span>${formattedDate} ${formattedTime}</span>
                    </div>
                    <div class="message-text">${this.escapeHtml(msg.text)}</div>
                    <div class="message-footer">
                        <button class="btn-danger" onclick="app.deleteMessage(${msg.id})">
                            🗑️ Löschen
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // === Utility Functions ===
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showStatus(message, isError = false) {
        const statusBar = document.getElementById('statusBar');
        statusBar.textContent = message;
        statusBar.className = 'status-bar show' + (isError ? ' error' : '');

        setTimeout(() => {
            statusBar.classList.remove('show');
        }, 3000);
    }

    // === Data Export/Import for P2P Sync ===
    exportData() {
        return {
            contacts: this.contacts,
            messages: this.messages,
            exportedAt: new Date().toISOString()
        };
    }

    importData(data) {
        if (confirm('Daten importieren? Dies überschreibt vorhandene Daten.')) {
            this.contacts = data.contacts || [];
            this.messages = data.messages || [];
            this.saveContacts();
            this.saveMessages();
            this.renderContacts();
            this.renderMessages();
            this.updateRecipientSelect();
            this.showStatus('Daten importiert ✓', false);
        }
    }
}

// Initialize App
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new AddressBook();
});

// Make export/import available in console for P2P sync
window.exportAddressBookData = () => {
    const data = app.exportData();
    console.log('Exportierte Daten:', JSON.stringify(data));
    return data;
};

window.importAddressBookData = (data) => {
    app.importData(data);
};
