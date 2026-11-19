/**
 * Kleine Navigation über den Teil der Adresse hinter dem #.
 * So funktionieren Zurück-Taste, Lesezeichen und Einladungslinks,
 * ohne dass der Server etwas davon wissen muss.
 */

import { useEffect, useState } from 'react';

export function parseHash(hash: string): string[] {
  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

export function href(...segments: string[]): string {
  return '#/' + segments.map(encodeURIComponent).join('/');
}

export function navigate(...segments: string[]): void {
  window.location.hash = href(...segments).slice(1);
}

export function replaceRoute(...segments: string[]): void {
  const url = new URL(window.location.href);
  url.hash = href(...segments).slice(1);
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): string[] {
  const [segments, setSegments] = useState<string[]>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setSegments(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return segments;
}
