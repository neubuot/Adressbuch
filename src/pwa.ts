/**
 * Installation als App und Offline-Betrieb
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

export type InstallState = 'installed' | 'promptable' | 'ios' | 'manual';

export function useInstall(): { state: InstallState; install: () => Promise<boolean> } {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const state: InstallState = isStandalone()
    ? 'installed'
    : deferredPrompt
      ? 'promptable'
      : isIos()
        ? 'ios'
        : 'manual';

  const install = async () => {
    if (!deferredPrompt) return false;
    const prompt = deferredPrompt;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    notify();
    return choice.outcome === 'accepted';
  };

  return { state, install };
}

/**
 * Meldet den Service Worker an, der die App offline verfügbar macht.
 * Nur im gebauten Zustand, damit die Entwicklung nicht aus dem Zwischenspeicher lädt.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI))
      .catch((error) => console.warn('Offline-Betrieb nicht verfügbar', error));
  };
  // Die App startet verzögert; das Ladeereignis kann dann schon vorbei sein
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
