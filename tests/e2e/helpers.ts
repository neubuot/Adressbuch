import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Kommt eine direkte Verbindung nicht zustande, versucht die App es nach
 * 15 Sekunden von selbst erneut. Die Tests warten deshalb entsprechend lange.
 */
export const CONNECT_TIMEOUT = 60000;

export interface Person {
  context: BrowserContext;
  page: Page;
}

/** Öffnet die App in einem eigenen, leeren Browserprofil */
export async function openApp(browser: Browser, path = '/'): Promise<Person> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  return { context, page };
}

/** Erledigt den Einstieg: Name eintragen, fertig */
export async function onboard(page: Page, firstName: string, lastName: string): Promise<void> {
  await page.getByLabel('Vorname').fill(firstName);
  await page.getByLabel('Nachname').fill(lastName);
  await page.getByRole('button', { name: /^(Fertig|Weiter)$/ }).click();
  await expect(page.locator('h1')).toHaveText(`P2P Adressbuch von ${firstName} ${lastName}`);
}

/** Füllt Felder der eigenen Karte und speichert */
export async function fillCard(page: Page, values: Record<string, string>): Promise<void> {
  await page.goto('/#/karte');
  for (const [id, value] of Object.entries(values)) {
    const input = page.locator(`#${id}`);
    if (!(await input.isVisible())) {
      // Feld liegt in einer zugeklappten Gruppe
      await input.evaluate((element) => {
        const details = element.closest('details');
        if (details) details.open = true;
      });
    }
    await input.fill(value);
  }
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Alles gespeichert')).toBeVisible();
}

/**
 * Verbindet zwei Personen: A lädt ein und zeigt den Code, B öffnet den
 * Einladungslink und wählt eine Vorlage.
 */
export async function connect(a: Page, b: Page, presetA: string, presetB: string): Promise<void> {
  await a.goto('/#/verbinden');
  await a.getByLabel(presetA, { exact: true }).check();
  await a.getByRole('button', { name: 'Weiter: Code zeigen' }).click();
  const code = ((await a.getByTestId('invite-code').textContent()) ?? '').replace(/[^A-Z0-9]/g, '');
  expect(code).toHaveLength(8);

  await b.goto(`/#/verbinden/${code}`);
  await b.getByLabel(presetB, { exact: true }).check();
  await b.getByRole('button', { name: 'Verbinden', exact: true }).click();

  await expect(a.getByRole('heading', { name: 'Verbunden' })).toBeVisible({ timeout: CONNECT_TIMEOUT });
  await expect(b.getByRole('heading', { name: 'Verbunden' })).toBeVisible({ timeout: CONNECT_TIMEOUT });
}

/** Die Zeile einer Angabe (Bezeichnung + Wert) im Abschnitt mit dieser Überschrift */
export function sectionByTitle(page: Page, title: string | RegExp) {
  return page.locator('section.section').filter({ has: page.getByRole('heading', { name: title }) });
}
