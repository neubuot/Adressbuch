// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { combineShares, decodeShare, encodeShare, splitSecret } from './shamir';
import { createVaultKey, openVault, sealVault, VaultError } from './vault';
import { splitText, TextAssembler, CHUNK_CHARS } from './chunks';

function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let value = seed;
  for (let i = 0; i < length; i++) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    out[i] = value & 0xff;
  }
  return out;
}

describe('Geheimnis teilen', () => {
  it('ergibt aus beliebigen k von n Teilen wieder das Geheimnis', () => {
    const secret = bytes(32, 7);
    const shares = splitSecret(secret, 5, 3);
    expect(shares).toHaveLength(5);
    for (const picked of [[0, 1, 2], [0, 2, 4], [4, 3, 1], [1, 2, 3, 4], [0, 1, 2, 3, 4]]) {
      expect(Array.from(combineShares(picked.map((i) => shares[i])))).toEqual(Array.from(secret));
    }
  });

  it('ergibt mit zu wenigen Teilen nicht das Geheimnis', () => {
    const secret = bytes(32, 9);
    const shares = splitSecret(secret, 4, 3);
    expect(Array.from(combineShares([shares[0], shares[1]]))).not.toEqual(Array.from(secret));
    expect(Array.from(combineShares([shares[3], shares[2]]))).not.toEqual(Array.from(secret));
  });

  it('funktioniert für alle Bytewerte und für 2 von 2', () => {
    const secret = new Uint8Array(256);
    for (let i = 0; i < 256; i++) secret[i] = i;
    const shares = splitSecret(secret, 2, 2);
    expect(Array.from(combineShares(shares))).toEqual(Array.from(secret));
    // Ein einzelner Teil ist nicht das Geheimnis
    expect(Array.from(shares[0].y)).not.toEqual(Array.from(secret));
  });

  it('ist mit festem Zufall nachvollziehbar: Teil = Geheimnis + a mal x', () => {
    // Grad 1 mit Koeffizient 1: Wert an der Stelle x ist Geheimnis XOR x
    const shares = splitSecret(new Uint8Array([10, 200]), 3, 2, (length) => new Uint8Array(length).fill(1));
    expect(Array.from(shares[0].y)).toEqual([10 ^ 1, 200 ^ 1]);
    expect(Array.from(shares[2].y)).toEqual([10 ^ 3, 200 ^ 3]);
  });

  it('lehnt unbrauchbare Angaben ab', () => {
    const secret = bytes(8);
    expect(() => splitSecret(secret, 3, 1)).toThrow();
    expect(() => splitSecret(secret, 2, 3)).toThrow();
    expect(() => splitSecret(secret, 300, 2)).toThrow();
    expect(() => splitSecret(new Uint8Array(0), 3, 2)).toThrow();
    const shares = splitSecret(secret, 3, 2);
    expect(() => combineShares([shares[0]])).toThrow();
    expect(() => combineShares([shares[0], shares[0]])).toThrow();
    expect(() => combineShares([shares[0], { x: 2, y: new Uint8Array(3) }])).toThrow();
  });

  it('wandelt Teile verlustfrei in Text und zurück', () => {
    const shares = splitSecret(bytes(32, 3), 3, 2);
    for (const share of shares) {
      const decoded = decodeShare(encodeShare(share));
      expect(decoded.x).toBe(share.x);
      expect(Array.from(decoded.y)).toEqual(Array.from(share.y));
    }
    expect(() => decodeShare('kein base64 !!!')).toThrow();
    expect(() => decodeShare('')).toThrow();
  });
});

describe('Tresor', () => {
  const content = { snapshot: bytes(5000, 11), keyPair: { publicKey: 'oeffentlich', privateKey: 'streng-geheim' } };

  it('lässt sich mit genügend Teilen öffnen und enthält Adressbuch und Schlüssel', async () => {
    const { key, shares } = createVaultKey(3, 2);
    const vault = await sealVault(content, key);
    expect(vault).not.toContain('streng-geheim');

    for (const picked of [[0, 1], [2, 0], [1, 2], [0, 1, 2]]) {
      const opened = await openVault(vault, picked.map((i) => shares[i]));
      expect(Array.from(opened.snapshot)).toEqual(Array.from(content.snapshot));
      expect(opened.keyPair).toEqual(content.keyPair);
    }
  });

  it('bleibt mit einem Teil, fremden Teilen oder verändertem Inhalt verschlossen', async () => {
    const { key, shares } = createVaultKey(3, 2);
    const other = createVaultKey(3, 2);
    const vault = await sealVault(content, key);

    await expect(openVault(vault, [shares[0]])).rejects.toBeInstanceOf(VaultError);
    await expect(openVault(vault, [shares[0], other.shares[1]])).rejects.toBeInstanceOf(VaultError);
    await expect(openVault(vault, other.shares)).rejects.toBeInstanceOf(VaultError);
    await expect(openVault('kein Tresor', shares)).rejects.toBeInstanceOf(VaultError);

    const file = JSON.parse(vault);
    file.data = file.data.slice(0, 20) + (file.data[20] === 'A' ? 'B' : 'A') + file.data.slice(21);
    await expect(openVault(JSON.stringify(file), shares)).rejects.toBeInstanceOf(VaultError);
  });

  it('braucht bei 3 von 5 mindestens drei Teile', async () => {
    const { key, shares } = createVaultKey(5, 3);
    const vault = await sealVault(content, key);
    await expect(openVault(vault, [shares[0], shares[4]])).rejects.toBeInstanceOf(VaultError);
    expect((await openVault(vault, [shares[4], shares[1], shares[2]])).keyPair).toEqual(content.keyPair);
  });
});

describe('Übertragung in Stücken', () => {
  it('zerlegt und setzt wieder zusammen', () => {
    const text = 'abc'.repeat(CHUNK_CHARS);
    const parts = splitText(text);
    expect(parts).toHaveLength(3);
    const assembler = new TextAssembler(1_000_000);
    let result: string | null = null;
    parts.forEach((part, seq) => {
      result = assembler.add('a', seq, parts.length, part);
    });
    expect(result).toBe(text);
    expect(splitText('')).toEqual(['']);
  });

  it('verwirft Lücken, vertauschte Stücke, fremde Kennungen und zu große Texte', () => {
    const assembler = new TextAssembler(25);
    expect(assembler.add('a', 0, 3, 'eins')).toBeNull();
    expect(assembler.add('a', 2, 3, 'drei')).toBeNull();
    // Nach dem Fehler beginnt nur Stück 0 eine neue Übertragung
    expect(assembler.add('a', 1, 3, 'zwei')).toBeNull();
    expect(assembler.add('a', 0, 2, 'eins')).toBeNull();
    expect(assembler.add('b', 1, 2, 'zwei')).toBeNull();
    expect(assembler.add('a', 0, 2, 'eins')).toBeNull();
    expect(assembler.add('a', 1, 2, 'zwei')).toBe('einszwei');

    expect(assembler.add('a', 0, 2, 'x'.repeat(20))).toBeNull();
    expect(assembler.add('a', 1, 2, 'x'.repeat(20))).toBeNull();
    expect(assembler.add('a', 0, 1, 7 as unknown)).toBeNull();
    expect(assembler.add('a', 0, 0, '')).toBeNull();
    expect(assembler.add('a', 0, 1, 'ganz')).toBe('ganz');
  });
});
