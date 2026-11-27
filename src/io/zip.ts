/**
 * Eine einzelne Datei aus einem ZIP-Archiv lesen, ohne das ganze Archiv zu
 * laden. Gelesen werden nur das Inhaltsverzeichnis am Ende und die gesuchte
 * Datei. So bleibt auch ein großes Archiv (z. B. der vollständige
 * LinkedIn-Export mit Bildern) handhabbar.
 *
 * Unterstützt: unkomprimiert und Deflate. Nicht unterstützt: verschlüsselte
 * Archive und ZIP64 (Archive über 4 GB oder mit mehr als 65.535 Dateien).
 */

export class ZipError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-zip' | 'unsupported' | 'too-large' | 'damaged'
  ) {
    super(message);
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  encrypted: boolean;
  compressedSize: number;
  size: number;
  offset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024;

async function bytesOf(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** Liest das Inhaltsverzeichnis des Archivs */
export async function listZip(file: Blob): Promise<ZipEntry[]> {
  if (file.size < EOCD_MIN) throw new ZipError('Kein ZIP-Archiv.', 'not-zip');

  const tailStart = Math.max(0, file.size - EOCD_MIN - MAX_COMMENT);
  const tail = await bytesOf(file, tailStart, file.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - EOCD_MIN; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Kein ZIP-Archiv.', 'not-zip');

  const count = tailView.getUint16(eocd + 10, true);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new ZipError('Dieses Archiv ist zu groß für den direkten Import.', 'unsupported');
  }
  if (directorySize > MAX_DIRECTORY_BYTES || directoryOffset + directorySize > file.size) {
    throw new ZipError('Das Archiv ist beschädigt.', 'damaged');
  }

  const directory = await bytesOf(file, directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entries: ZipEntry[] = [];
  let position = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > directory.length || view.getUint32(position, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError('Das Archiv ist beschädigt.', 'damaged');
    }
    const flags = view.getUint16(position + 8, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const nameBytes = directory.subarray(position + 46, position + 46 + nameLength);
    entries.push({
      // Bit 11: Name in UTF-8; sonst genügt für die gesuchten Namen Latin-1
      name: new TextDecoder(flags & 0x0800 ? 'utf-8' : 'latin1').decode(nameBytes),
      method: view.getUint16(position + 10, true),
      encrypted: (flags & 0x0001) !== 0,
      compressedSize: view.getUint32(position + 20, true),
      size: view.getUint32(position + 24, true),
      offset: view.getUint32(position + 42, true),
    });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Blob, maxBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new ZipError('Dieser Browser kann das Archiv nicht entpacken.', 'unsupported');
  }
  const reader = data.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      // Schutz vor Archiven, die sich beim Entpacken aufblähen
      if (total > maxBytes) {
        await reader.cancel();
        throw new ZipError('Die Datei im Archiv ist zu groß.', 'too-large');
      }
      chunks.push(value);
    }
  } catch (problem) {
    if (problem instanceof ZipError) throw problem;
    throw new ZipError('Das Archiv ist beschädigt.', 'damaged');
  }
  const result = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

/** Liest den Inhalt einer Datei aus dem Archiv */
export async function readZipEntry(file: Blob, entry: ZipEntry, maxBytes: number): Promise<Uint8Array> {
  if (entry.encrypted) throw new ZipError('Das Archiv ist mit einem Kennwort geschützt.', 'unsupported');
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ZipError('Das Archiv verwendet ein Verfahren, das hier nicht unterstützt wird.', 'unsupported');
  }
  if (entry.size > maxBytes || entry.compressedSize > maxBytes) {
    throw new ZipError('Die Datei im Archiv ist zu groß.', 'too-large');
  }

  const header = await bytesOf(file, entry.offset, entry.offset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || view.getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw new ZipError('Das Archiv ist beschädigt.', 'damaged');
  }
  const start = entry.offset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const end = start + entry.compressedSize;
  if (end > file.size) throw new ZipError('Das Archiv ist beschädigt.', 'damaged');

  if (entry.method === 0) return bytesOf(file, start, end);
  return inflate(file.slice(start, end), maxBytes);
}

/** Erkennt ein ZIP-Archiv an seinen ersten Bytes */
export async function looksLikeZip(file: Blob): Promise<boolean> {
  if (file.size < EOCD_MIN) return false;
  const head = await bytesOf(file, 0, 4);
  return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05) && (head[3] === 0x04 || head[3] === 0x06);
}
