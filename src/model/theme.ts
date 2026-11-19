/**
 * Darstellung: folgt dem Gerät oder ist fest auf hell bzw. dunkel gestellt
 */

export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'adressbuch.theme';

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  const dark =
    theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#151514' : '#f1efe9');
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // ohne Speicherzugriff gilt die Wahl nur bis zum Neuladen
  }
  applyTheme(theme);
}
