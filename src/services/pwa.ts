import { showStatus } from '../utils/dom';

/**
 * PWA setup and management service
 */
class PWAService {
  private deferredPrompt: any = null;

  /**
   * Initializes PWA features
   */
  init(): void {
    this.registerServiceWorker();
    this.setupInstallPrompt();
    this.setupNetworkStatus();
  }

  /**
   * Registers the service worker
   */
  private registerServiceWorker(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => console.log('Service Worker registriert:', reg))
        .catch(err => console.error('Service Worker Fehler:', err));
    }
  }

  /**
   * Sets up PWA install prompt handling
   */
  private setupInstallPrompt(): void {
    const installBtn = document.getElementById('installBtn');
    if (!installBtn) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      installBtn.style.display = 'block';
    });

    installBtn.addEventListener('click', async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`Installation: ${outcome}`);
        this.deferredPrompt = null;
        installBtn.style.display = 'none';
      }
    });
  }

  /**
   * Sets up online/offline status monitoring
   */
  private setupNetworkStatus(): void {
    window.addEventListener('online', () => {
      showStatus('Online - Verbunden', false);
    });

    window.addEventListener('offline', () => {
      showStatus('Offline-Modus aktiv', true);
    });
  }
}

export const pwaService = new PWAService();
