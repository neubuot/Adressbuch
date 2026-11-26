/**
 * Daten: Migration vom alten Schema, Import, Suche, Tags, Export, Sicherung
 */

import { test, expect, type Page } from '@playwright/test';
import * as Automerge from '@automerge/automerge';
import { readFile } from 'node:fs/promises';
import { openApp, onboard, fillCard, connect, sectionByTitle, CONNECT_TIMEOUT } from './helpers';

/** Stand, wie ihn die App vor der Erweiterung der Felder gespeichert hat */
function oldSchemaSnapshot(): number[] {
  const doc = Automerge.from<Record<string, unknown>>({
    myCard: {
      id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      firstName: 'Max',
      lastName: 'Altbestand',
      street: 'Musterstraße 12a',
      postalCode: '12345',
      city: 'Berlin',
      country: 'Deutschland',
      email: 'max@example.org',
      phone: '+49 170 1234567',
      birthday: '1990-01-02',
      organization: 'Musterfirma',
      custom: {},
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    connections: {
      'AAAA-BBBB-CCCC-DDDD': {
        id: 'AAAA-BBBB-CCCC-DDDD',
        label: 'Tante Anna',
        peerPubKey: 'unbekannt',
        allowedFields: ['firstName', 'lastName', 'email', 'phone'],
        storeRemoteCard: true,
        status: 'online',
        createdAt: '2024-02-02T10:00:00.000Z',
        lastSyncAt: '2024-03-03T10:00:00.000Z',
        remoteCard: { firstName: 'Anna', lastName: 'Früher', email: 'anna@example.org', phone: '0151 555' },
        tagIds: ['t1'],
      },
    },
    tags: { t1: { id: 't1', name: 'Familie', color: '#b0483f', createdAt: '2024-01-01T00:00:00.000Z' } },
    knownPeers: [],
  });
  return Array.from(Automerge.save(doc));
}

async function writeStoredDocument(page: Page, snapshot: number[]): Promise<void> {
  await page.evaluate(async (bytes) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('P2PAddressBook');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put({
          id: 'myCard',
          snapshot: new Uint8Array(bytes),
          changes: [],
          updatedAt: '2024-03-03T10:00:00.000Z',
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, snapshot);
}

test('Daten im alten Schema werden beim Start migriert, nichts geht verloren', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Vorname')).toBeVisible(); // Datenbank ist angelegt
  await writeStoredDocument(page, oldSchemaSnapshot());
  await page.reload();

  await expect(page.locator('h1')).toHaveText('P2P Adressbuch von Max Altbestand');

  // Eigene Karte: alte Felder sind in die neuen übergegangen
  await page.goto('/#/karte');
  await expect(page.locator('#firstName')).toHaveValue('Max');
  await expect(page.locator('#emailPrivate')).toHaveValue('max@example.org');
  await expect(page.locator('#phoneMobile')).toHaveValue('+49 170 1234567');
  await expect(page.locator('#street')).toHaveValue('Musterstraße');
  await expect(page.locator('#houseNumber')).toHaveValue('12a');
  await expect(page.locator('#postalCode')).toHaveValue('12345');
  await expect(page.locator('#city')).toHaveValue('Berlin');
  await page.locator('summary', { hasText: 'Adresse' }).click();
  await expect(page.locator('#country')).toHaveValue('DE');
  await page.locator('summary', { hasText: 'Beruf und Organisation' }).click();
  await expect(page.locator('#organization')).toHaveValue('Musterfirma');
  await page.locator('summary', { hasText: 'Weitere Angaben' }).click();
  await expect(page.locator('#birthday')).toHaveValue('1990-01-02');

  // Kontakt: Bezeichnung, empfangene Angaben, Freigabe, Tag, Zeitstempel
  await page.goto('/#/');
  const row = page.getByRole('link', { name: /Tante Anna/ });
  await expect(row).toContainText('Wartet auf Verbindung'); // nicht mehr fälschlich "verbunden"
  await row.click();
  const angaben = sectionByTitle(page, 'Angaben');
  await expect(angaben).toContainText('anna@example.org');
  await expect(angaben).toContainText('0151 555');
  const freigabe = sectionByTitle(page, 'Was Tante Anna von mir sieht');
  await expect(freigabe).toContainText('max@example.org');
  await expect(freigabe).toContainText('+49 170 1234567');
  await expect(page.getByRole('button', { name: 'Familie', pressed: true })).toBeVisible();
  const verlauf = sectionByTitle(page, 'Verlauf');
  await expect(verlauf).toContainText('02.02.2024');
  await expect(verlauf).toContainText('03.03.2024');

  // Nach erneutem Laden unverändert (Migration ist gespeichert und wiederholbar)
  await page.reload();
  await expect(sectionByTitle(page, 'Angaben')).toContainText('anna@example.org');
});

test('Daten einer neueren App-Version werden nicht überschrieben', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Vorname')).toBeVisible();
  const future = Automerge.from<Record<string, unknown>>({
    schemaVersion: '9.0.0',
    myCard: { id: 'x', vorname: 'Zukunft' },
    kontakte: {},
  });
  const bytes = Array.from(Automerge.save(future));
  await writeStoredDocument(page, bytes);
  await page.reload();

  await expect(page.getByRole('alert')).toContainText('Diese App-Version ist zu alt für deine Daten');

  const stored = await page.evaluate(async () => {
    return await new Promise<number[]>((resolve, reject) => {
      const request = indexedDB.open('P2PAddressBook');
      request.onsuccess = () => {
        const get = request.result.transaction('documents').objectStore('documents').get('myCard');
        get.onsuccess = () => resolve(Array.from(get.result.snapshot as Uint8Array));
        get.onerror = () => reject(get.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  expect(stored).toEqual(bytes);
});

test('Import aus vCard und CSV, Suche, Tags, Export', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');

  // Tag anlegen
  await page.goto('/#/mehr/tags');
  await page.getByLabel('Neuer Tag').fill('Verein');
  await page.getByRole('button', { name: 'Tag anlegen' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Verein' })).toBeVisible();

  // vCard importieren, alle mit Tag "Verein"
  await page.goto('/#/mehr/import');
  const vcf = [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Sommer;Clara;;;', 'FN:Clara Sommer', 'TEL;TYPE=CELL:+49 160 123 45 67',
    'EMAIL;TYPE=HOME:clara@example.org', 'ADR;TYPE=HOME:;;Seeweg 3;Konstanz;;78462;DE', 'NOTE:Segelt gern', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Winter;Dirk;;;', 'FN:Dirk Winter', 'ORG:Eis AG', 'END:VCARD', '',
  ].join('\r\n');
  await page.getByLabel('Datei auswählen').setInputFiles({ name: 'kontakte.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcf) });
  await expect(page.getByRole('heading', { name: '2 Kontakte gefunden' })).toBeVisible();
  await page.getByLabel(/Tag für alle/).selectOption({ label: 'Verein' });
  await page.getByRole('button', { name: '2 Kontakte übernehmen' }).click();
  await expect(page.getByText('2 Kontakte', { exact: true })).toBeVisible();

  // CSV importieren
  await page.goto('/#/mehr/import');
  const csv = 'Vorname;Nachname;Mobil;Ort\nEmil;Herbst;0171 999;Hamburg\n';
  await page.getByLabel('Datei auswählen').setInputFiles({ name: 'liste.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Kontakt übernehmen' }).click();

  // Liste: drei nicht verbundene Einträge
  await expect(page.getByText('3 Kontakte', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toContainText('Nicht verbunden');

  // Suche über alle Felder
  const search = page.getByLabel('Kontakte durchsuchen');
  await search.fill('konstanz');
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toContainText('Ort: Konstanz');
  await expect(page.getByRole('link', { name: /Dirk Winter/ })).toBeHidden();
  await search.fill('1601234567');
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toBeVisible();
  await search.fill('segelt');
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toContainText('Notizen: Segelt gern');
  await search.fill('gibtesnicht');
  await expect(page.getByText('Nichts gefunden')).toBeVisible();

  // Filter nach Tag
  await search.fill('');
  await page.getByRole('button', { name: 'Verein' }).click();
  await expect(page.getByText('2 von 3 Kontakten')).toBeVisible();
  await expect(page.getByRole('link', { name: /Emil Herbst/ })).toBeHidden();

  // Direkte Aktionen am Kontakt
  await page.getByRole('link', { name: /Clara Sommer/ }).click();
  await expect(page.getByRole('link', { name: 'Anrufen' })).toHaveAttribute('href', 'tel:+491601234567');
  await expect(page.getByRole('link', { name: 'E-Mail', exact: true })).toHaveAttribute('href', 'mailto:clara@example.org');
  await expect(page.getByRole('link', { name: 'Karte', exact: true })).toHaveAttribute('href', /Seeweg%203/);
  const vcardDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ins Telefonbuch' }).click();
  const vcard = await readFile(await (await vcardDownload).path());
  expect(vcard.toString()).toContain('N:Sommer;Clara');
  expect(vcard.toString()).not.toContain('Segelt gern'); // private Notiz bleibt privat

  // Export: nur Tag "Verein", Z bis A, als CSV mit Kontaktdaten
  await page.goto('/#/mehr/export');
  await page.getByRole('button', { name: 'Verein' }).click();
  await page.getByText('Z bis A').click();
  const preview = sectionByTitle(page, 'Vorschau').getByRole('listitem');
  await expect(preview).toHaveText([/Dirk Winter/, /Clara Sommer/]);
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Datei speichern' }).click();
  const exported = (await readFile(await (await csvDownload).path())).toString();
  const lines = exported.trim().split('\r\n');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toContain('"telefon_mobil"');
  expect(lines[1]).toContain('"Winter"');
  expect(lines[2]).toContain('"+49 160 123 45 67"');
  expect(lines[2]).toContain('"Konstanz"');
  expect(exported).not.toContain('Segelt gern');
  expect(exported).not.toContain('Herbst');
});

test('Importierter Eintrag wird per Einladung zur echten Verbindung; Notizen und Tags bleiben', async ({ browser }) => {
  const max = await openApp(browser);
  const clara = await openApp(browser);
  await onboard(max.page, 'Max', 'Mustermann');
  await onboard(clara.page, 'Clara', 'Sommer');
  await fillCard(clara.page, { phoneMobile: '+49 160 7654321' });

  await max.page.goto('/#/mehr/import');
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Sommer;Clara;;;\r\nTEL;TYPE=CELL:0160 alt\r\nNOTE:Kennt sich mit Booten aus\r\nEND:VCARD\r\n';
  await max.page.getByLabel('Datei auswählen').setInputFiles({ name: 'clara.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcf) });
  await max.page.getByRole('button', { name: 'Kontakt übernehmen' }).click();
  await max.page.getByRole('link', { name: /Clara Sommer/ }).click();
  await max.page.getByRole('link', { name: 'Einladen und verbinden' }).click();

  await max.page.getByRole('button', { name: 'Weiter: Code zeigen' }).click();
  const code = ((await max.page.getByTestId('invite-code').textContent()) ?? '').replace(/[^A-Z0-9]/g, '');
  await clara.page.goto(`/#/verbinden/${code}`);
  await clara.page.getByRole('button', { name: 'Verbinden', exact: true }).click();
  await expect(max.page.getByRole('heading', { name: 'Verbunden' })).toBeVisible({ timeout: CONNECT_TIMEOUT });

  // Es gibt genau einen Eintrag für Clara: verbunden, mit aktueller Nummer und alter Notiz
  await max.page.goto('/#/');
  await expect(max.page.getByText('1 Kontakt', { exact: true })).toBeVisible();
  await max.page.getByRole('link', { name: /Clara Sommer/ }).click();
  await expect(sectionByTitle(max.page, 'Angaben')).toContainText('+49 160 7654321', { timeout: 15000 });
  await expect(max.page.getByLabel('Notizen')).toHaveValue('Kennt sich mit Booten aus');

  await max.context.close();
  await clara.context.close();
});

test('Private Notizen werden nie übertragen', async ({ browser }) => {
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');

  // Alle Nachrichten mitschneiden, die Annas Browser über die direkte Verbindung sendet
  await anna.page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __sent: string[] }).__sent = sent;
    const original = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (data: unknown) {
      try {
        sent.push(typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer));
      } catch {
        sent.push('[nicht lesbar]');
      }
      return (original as (this: RTCDataChannel, data: unknown) => void).call(this, data);
    } as typeof RTCDataChannel.prototype.send;
  });
  await anna.page.reload();

  await connect(anna.page, bert.page, 'Alles', 'Alles');
  await anna.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  await anna.page.getByLabel('Notizen').fill('GEHEIME-NOTIZ-4711');
  await anna.page.getByLabel('Notizen').blur();
  await expect(anna.page.getByText('Notiz gespeichert')).toBeVisible();
  await anna.page.getByRole('button', { name: 'Heute gesprochen' }).click();
  await fillCard(anna.page, { city: 'Potsdam' });

  await bert.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  await expect(sectionByTitle(bert.page, 'Angaben')).toContainText('Potsdam', { timeout: 15000 });

  const sent = await anna.page.evaluate(() => (window as unknown as { __sent: string[] }).__sent);
  expect(sent.length).toBeGreaterThan(2);
  expect(sent.join('\n')).toContain('Potsdam');
  expect(sent.join('\n')).not.toContain('GEHEIME-NOTIZ-4711');
  expect(sent.join('\n')).not.toMatch(/notes|lastContactAt|private/);

  await anna.context.close();
  await bert.context.close();
});

test('Verschlüsselte Sicherung lässt sich auf einem anderen Gerät wiederherstellen', async ({ browser }) => {
  const first = await openApp(browser);
  await onboard(first.page, 'Max', 'Mustermann');
  await fillCard(first.page, { phoneMobile: '0170 42' });
  await first.page.goto('/#/mehr/import');
  await first.page.getByLabel('Datei auswählen').setInputFiles({
    name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('Vorname;Nachname\nEmil;Herbst\n'),
  });
  await first.page.getByRole('button', { name: 'Kontakt übernehmen' }).click();

  // Hinweis, dass die Daten nur auf diesem Gerät liegen
  await expect(first.page.getByText('Deine Daten liegen nur auf diesem Gerät')).toBeVisible();
  await first.page.getByRole('link', { name: 'Jetzt sichern' }).click();

  await first.page.getByLabel('Passwort für die Sicherung').fill('kurz');
  await first.page.getByLabel('Passwort wiederholen').fill('kurz');
  await first.page.getByRole('button', { name: 'Sicherung speichern' }).click();
  await expect(first.page.getByRole('alert')).toContainText('mindestens 8 Zeichen');

  await first.page.getByLabel('Passwort für die Sicherung').fill('sicheres passwort');
  await first.page.getByLabel('Passwort wiederholen').fill('sicheres passwort');
  const download = first.page.waitForEvent('download');
  await first.page.getByRole('button', { name: 'Sicherung speichern' }).click();
  const file = await (await download).path();
  const content = (await readFile(file)).toString();
  expect(content).not.toContain('Mustermann'); // verschlüsselt
  expect(content).not.toContain('Herbst');
  await first.page.goto('/#/');
  await expect(first.page.getByText('Deine Daten liegen nur auf diesem Gerät')).toBeHidden();

  // Zweites, leeres Gerät: direkt vom Einstieg aus wiederherstellen
  const second = await openApp(browser);
  await second.page.getByRole('link', { name: /Sicherung wiederherstellen/ }).click();
  await second.page.getByLabel('Sicherungsdatei').setInputFiles({ name: 'sicherung.adressbuch', mimeType: 'application/json', buffer: Buffer.from(content) });
  await second.page.getByLabel('Passwort der Sicherung').fill('falsches passwort');
  await second.page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(second.page.getByRole('alert')).toContainText('Das Passwort passt nicht');

  await second.page.getByLabel('Passwort der Sicherung').fill('sicheres passwort');
  await second.page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(second.page.locator('h1')).toHaveText('P2P Adressbuch von Max Mustermann', { timeout: 20000 });
  await expect(second.page.getByRole('link', { name: /Emil Herbst/ })).toBeVisible();
  await second.page.goto('/#/karte');
  await expect(second.page.locator('#phoneMobile')).toHaveValue('0170 42');

  await first.context.close();
  await second.context.close();
});

test('Dieselbe Datei zweimal einlesen verdoppelt nichts; eine zweite Datei ergänzt vorhandene Kontakte', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');

  const vcf = [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Sommer;Clara;;;', 'EMAIL;TYPE=HOME:clara@example.org', 'ADR;TYPE=HOME:;;Seeweg 3;Konstanz;;78462;DE', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Winter;Dirk;;;', 'ORG:Eis AG', 'END:VCARD', '',
  ].join('\r\n');
  const load = async (name: string, text: string) => {
    await page.goto('/#/mehr/import');
    await page.getByLabel('Datei auswählen').setInputFiles({ name, mimeType: 'text/vcard', buffer: Buffer.from(text) });
  };

  await load('kontakte.vcf', vcf);
  await page.getByRole('button', { name: '2 Kontakte übernehmen' }).click();
  await expect(page.getByText('2 Kontakte', { exact: true })).toBeVisible();

  // Zweites Einlesen derselben Datei: wird als vorhanden erkannt
  await load('kontakte.vcf', vcf);
  await expect(page.getByRole('heading', { name: 'Schon vorhanden' })).toBeVisible();
  await expect(page.getByText('2 aus dieser Datei schon übernommen, werden aktualisiert')).toBeVisible();
  await page.getByRole('button', { name: '2 Kontakte übernehmen' }).click();
  await expect(page.getByText('2 Kontakte', { exact: true })).toBeVisible();

  // Andere Datei, gleiche E-Mail, andere Stadt und zusätzlich eine Nummer
  const other = [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Sommer;Clara;;;', 'EMAIL;TYPE=WORK:CLARA@example.org', 'TEL;TYPE=CELL:0160 7654321',
    'ADR;TYPE=HOME:;;Hafenstr. 1;Lindau;;88131;DE', 'END:VCARD', '',
  ].join('\r\n');
  await load('neu.vcf', other);
  await expect(page.getByText('1 gehören zu vorhandenen Kontakten')).toBeVisible();
  await expect(page.getByText('gleiche E-Mail-Adresse')).toBeVisible();
  await page.getByLabel('was in dieser Datei steht').check();
  await page.getByRole('button', { name: 'Kontakt übernehmen' }).click();

  await expect(page.getByText('2 Kontakte', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Clara Sommer/ }).click();
  await expect(page.getByText('Lindau')).toBeVisible();
  await expect(page.getByText('0160 7654321')).toBeVisible();
});

test('Kontakte aus dem Telefonbuch des Geräts wählen; erneutes Wählen verdoppelt nichts', async ({ page }) => {
  // Ohne Kontaktauswahl im Browser gibt es den Knopf nicht
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');
  await page.goto('/#/mehr/import');
  await expect(page.getByLabel('Datei auswählen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aus dem Telefonbuch wählen' })).toBeHidden();

  // Kontaktauswahl des Geräts nachstellen (gibt es sonst nur in Chrome auf Android)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'contacts', {
      configurable: true,
      value: {
        getProperties: async () => ['name', 'email', 'tel', 'address'],
        select: async () => [
          { name: ['Clara Sommer'], email: ['clara@example.org'], tel: ['0160 1234567'], address: [{ addressLine: ['Seeweg 3'], city: 'Konstanz', postalCode: '78462' }] },
          { name: ['Emil Herbst'], tel: ['0171 999000'] },
        ],
      },
    });
  });
  await page.reload();

  await page.getByRole('button', { name: 'Aus dem Telefonbuch wählen' }).click();
  await expect(page.getByRole('heading', { name: '2 Kontakte gefunden' })).toBeVisible();
  await page.getByRole('button', { name: '2 Kontakte übernehmen' }).click();
  await expect(page.getByText('2 Kontakte', { exact: true })).toBeVisible();

  await page.goto('/#/mehr/import');
  await page.getByRole('button', { name: 'Aus dem Telefonbuch wählen' }).click();
  await expect(page.getByText('2 aus dem Telefonbuch schon übernommen, werden aktualisiert')).toBeVisible();
  await page.getByRole('button', { name: '2 Kontakte übernehmen' }).click();
  await expect(page.getByText('2 Kontakte', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /Clara Sommer/ }).click();
  await expect(page.getByText('Konstanz')).toBeVisible();
  await expect(page.getByText('0160 1234567')).toBeVisible();
});
