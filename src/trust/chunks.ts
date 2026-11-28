/**
 * Lange Texte in Stücken übertragen. Eine einzelne Nachricht zwischen zwei
 * Geräten darf nicht beliebig groß sein. Der Tresor wird deshalb zerlegt
 * und auf der Gegenseite wieder zusammengesetzt.
 */

export const CHUNK_CHARS = 12_000;

export function splitText(text: string, size: number = CHUNK_CHARS): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts.length > 0 ? parts : [''];
}

/**
 * Setzt Stücke wieder zusammen. Die Stücke müssen lückenlos in der
 * richtigen Reihenfolge kommen. Alles andere verwirft die Übertragung.
 */
export class TextAssembler {
  private key = '';
  private parts: string[] = [];
  private total = 0;
  private chars = 0;

  constructor(private maxChars: number) {}

  /**
   * Nimmt ein Stück an. Gibt den vollständigen Text zurück, sobald das
   * letzte Stück da ist, sonst null.
   */
  add(key: string, seq: unknown, total: unknown, data: unknown): string | null {
    if (typeof seq !== 'number' || typeof total !== 'number' || typeof data !== 'string') return this.reset();
    if (!Number.isInteger(seq) || !Number.isInteger(total) || total < 1 || seq < 0 || seq >= total) return this.reset();
    if (data.length > CHUNK_CHARS * 2) return this.reset();

    if (seq === 0) {
      this.key = key;
      this.parts = [];
      this.total = total;
      this.chars = 0;
    } else if (key !== this.key || total !== this.total || seq !== this.parts.length) {
      return this.reset();
    }

    this.chars += data.length;
    if (this.chars > this.maxChars) return this.reset();
    this.parts.push(data);
    if (this.parts.length < this.total) return null;

    const text = this.parts.join('');
    this.reset();
    return text;
  }

  private reset(): null {
    this.key = '';
    this.parts = [];
    this.total = 0;
    this.chars = 0;
    return null;
  }
}
