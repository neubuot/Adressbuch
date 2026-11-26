import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const PORT = 4173;

// Normalerweise nutzt Playwright seinen eigenen Browser (npx playwright install).
// Ist stattdessen ein Browser vorgegeben (Variable oder fester Pfad), wird dieser verwendet.
const presetBrowser = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const executablePath = existsSync(presetBrowser) ? presetBrowser : undefined;

/**
 * Die Tests laufen gegen die gebaute App, ausgeliefert vom Vermittlungsdienst
 * (ein Dienst für App und Verbindungsaufbau, wie im echten Betrieb).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 150000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'off',
    // Kein Service Worker in den Tests, damit jeder Lauf den frischen Build lädt
    serviceWorkers: 'block',
    launchOptions: { executablePath },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Variablen über env statt in der Befehlszeile, damit es auch unter Windows läuft.
    // Die Google-Kennung ist ein Platzhalter; die Tests stellen Google nach.
    command: 'npm run build && node signaling-server/index.js',
    env: { PORT: String(PORT), VITE_GOOGLE_CLIENT_ID: 'e2e-test.apps.googleusercontent.com' },
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
