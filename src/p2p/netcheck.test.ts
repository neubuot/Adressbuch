/**
 * Verbindung prüfen: Auswertung der Adressen, die der Browser sammelt
 */

import { describe, expect, it } from 'vitest';
import { assessCandidates, describeResult, hasRelayServer, parseCandidate, withServerCount, type ParsedCandidate } from './netcheck';

const parse = (lines: string[]): ParsedCandidate[] => lines.map((line) => parseCandidate(line)!).filter(Boolean);

describe('Adressen lesen', () => {
  it('liest eigene Adressen, Adressen von außen und Umwege', () => {
    expect(parseCandidate('candidate:1 1 udp 2113937151 0f3a.local 54321 typ host generation 0')).toEqual({
      kind: 'host',
      protocol: 'udp',
      address: '0f3a.local',
      port: 54321,
    });
    expect(parseCandidate('a=candidate:2 1 UDP 1677729535 203.0.113.7 40001 typ srflx raddr 0.0.0.0 rport 54321 generation 0')).toEqual({
      kind: 'srflx',
      protocol: 'udp',
      address: '203.0.113.7',
      port: 40001,
      relatedAddress: '0.0.0.0',
      relatedPort: 54321,
    });
    expect(parseCandidate('candidate:3 1 udp 33562623 198.51.100.9 50000 typ relay raddr 203.0.113.7 rport 40001')?.kind).toBe('relay');
  });

  it('weist Unlesbares ab', () => {
    expect(parseCandidate('')).toBeNull();
    expect(parseCandidate('candidate:1 1 udp 1 1.2.3.4 abc typ host')).toBeNull();
    expect(parseCandidate('candidate:1 1 udp 1 1.2.3.4 5 typ unsinn')).toBeNull();
  });
});

describe('Netz einschätzen', () => {
  const host = 'candidate:1 1 udp 2113937151 0f3a.local 54321 typ host';

  it('geeignet: jede Gegenstelle sieht dieselbe Adresse', () => {
    // Gleiche Antworten zweier Hilfsserver fasst der Browser zu einer zusammen
    const result = assessCandidates(
      parse([host, 'candidate:2 1 udp 1677729535 203.0.113.7 40001 typ srflx raddr 0.0.0.0 rport 54321']),
      false
    );
    expect(result).toMatchObject({ verdict: 'open', host: 1, outside: 1, relay: 0, stable: true });
    expect(withServerCount(result, 2).verdict).toBe('open');
  });

  it('vermutlich geeignet: nur ein Hilfsserver, kein Vergleich möglich', () => {
    const result = assessCandidates(
      parse([host, 'candidate:2 1 udp 1677729535 203.0.113.7 40001 typ srflx raddr 0.0.0.0 rport 54321']),
      false
    );
    expect(withServerCount(result, 1)).toMatchObject({ verdict: 'likely', stable: null });
  });

  it('schwierig: derselbe Anschluss zeigt jeder Gegenstelle eine andere Adresse', () => {
    const result = assessCandidates(
      parse([
        host,
        'candidate:2 1 udp 1677729535 203.0.113.7 40001 typ srflx raddr 0.0.0.0 rport 54321',
        'candidate:3 1 udp 1677729535 203.0.113.7 40977 typ srflx raddr 0.0.0.0 rport 54321',
      ]),
      false
    );
    expect(result).toMatchObject({ verdict: 'strict', outside: 2, stable: false });
  });

  it('nicht schwierig: zwei eigene Anschlüsse mit je einer festen Adresse', () => {
    const result = assessCandidates(
      parse([
        host,
        'candidate:2 1 udp 1677729535 203.0.113.7 40001 typ srflx raddr 192.168.1.5 rport 54321',
        'candidate:3 1 udp 1677729535 203.0.113.7 40002 typ srflx raddr 10.0.0.5 rport 54322',
      ]),
      false
    );
    expect(result.verdict).toBe('open');
  });

  it('nicht schwierig: zwei Netzzugänge zugleich, der eigene Anschluss ist verborgen', () => {
    const result = assessCandidates(
      parse([
        host,
        'candidate:2 1 udp 1677729535 203.0.113.7 40001 typ srflx raddr 0.0.0.0 rport 0',
        'candidate:3 1 udp 1677729535 198.51.100.20 41000 typ srflx raddr 0.0.0.0 rport 0',
      ]),
      false
    );
    expect(result.verdict).toBe('open');
  });

  it('gesperrt: keine Adresse von außen', () => {
    const result = assessCandidates(parse([host, 'candidate:9 1 tcp 1518280447 0f3a.local 9 typ host tcptype active']), false);
    expect(result).toMatchObject({ verdict: 'blocked', host: 2, outside: 0, stable: null });
    // Antworten über TCP zählen nicht als erreichbar
    expect(assessCandidates(parse(['candidate:2 1 tcp 1 203.0.113.7 9 typ srflx raddr 0.0.0.0 rport 9']), false).verdict).toBe('blocked');
  });

  it('Umweg erreichbar: klappt auch aus schwierigen Netzen', () => {
    const result = assessCandidates(
      parse([host, 'candidate:3 1 udp 33562623 198.51.100.9 50000 typ relay raddr 203.0.113.7 rport 40001']),
      true
    );
    expect(result).toMatchObject({ verdict: 'relay', relay: 1, relayConfigured: true });
  });

  it('erkennt, ob ein Umweg eingetragen ist', () => {
    expect(hasRelayServer([{ urls: 'stun:stun.example.org' }])).toBe(false);
    expect(hasRelayServer([{ urls: ['stun:a.example.org', 'turns:b.example.org:5349'] }])).toBe(true);
  });

  it('beschreibt das Ergebnis ohne Adressen', () => {
    const text = describeResult(
      assessCandidates(parse([host, 'candidate:2 1 udp 1677729535 203.0.113.7 40001 typ srflx raddr 0.0.0.0 rport 54321']), false)
    );
    expect(text).toBe('Ergebnis open · eigene Adressen 1 · von außen 1 (gleich) · Umweg 0 (nicht eingerichtet)');
    expect(text).not.toContain('203.0.113.7');
  });
});
