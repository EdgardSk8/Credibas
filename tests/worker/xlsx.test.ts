import { describe, expect, it } from 'vitest';
import { buildXlsx, safeFileName, type XlsxCell } from '../../src/worker/lib/xlsx';

interface ZipEntry {
  name: string;
  method: number;
  crcOk: boolean;
  xmlOk: boolean;
  text: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Lee el ZIP «store» generado y devuelve sus entradas. */
function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  let eocd = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP sin EOCD');

  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error('Cabecera central inválida');
    const nameLength = view.getUint16(pointer + 28, true);
    const method = view.getUint16(pointer + 10, true);
    const crcHeader = view.getUint32(pointer + 16, true);
    const size = view.getUint32(pointer + 24, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    const localOffset = view.getUint32(pointer + 42, true);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    const text = decoder.decode(data);

    entries.push({
      name,
      method,
      crcOk: crc32(data) === crcHeader,
      xmlOk: name.endsWith('.xml') || name.endsWith('.rels') ? !text.includes('<parsererror') : true,
      text,
    });

    pointer += 46 + nameLength;
  }

  return entries;
}

function buildSample(currency: 'NIO' | 'USD' = 'NIO'): ZipEntry[] {
  const rows: XlsxCell[][] = [
    [{ value: 'Financiera Demo', bold: true, size: 16 }],
    [{ value: 'Reporte de cartera', bold: true }],
    [],
    [{ value: 'Indicador', bold: true, fill: 'F1E0A6', border: true }, { value: 'Valor', bold: true, border: true }],
    [{ value: 'Saldo pendiente', border: true }, { value: 1234.56, format: 'money', border: true }],
    [{ value: 'Morosidad', border: true }, { value: 4.2, format: 'percent', border: true }],
    [{ value: 'Préstamos', border: true }, { value: 12, format: 'integer', border: true }],
  ];

  return readZip(
    buildXlsx(
      {
        name: 'Cartera',
        columns: [{ width: 30 }, { width: 20 }],
        rows,
        merges: ['A1:B1'],
        freezeRows: 4,
      },
      { currency },
    ),
  );
}

describe('exportación a Excel', () => {
  it('genera un paquete XLSX válido con todas sus partes', () => {
    const entries = buildSample();
    const names = entries.map((entry) => entry.name);

    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(entries.every((entry) => entry.method === 0)).toBe(true);
    expect(entries.every((entry) => entry.crcOk)).toBe(true);
    expect(entries.every((entry) => entry.xmlOk)).toBe(true);
  });

  it('escribe textos, números, combinaciones y panel inmovilizado', () => {
    const sheet = buildSample().find((entry) => entry.name === 'xl/worksheets/sheet1.xml');

    expect(sheet?.text).toContain('Financiera Demo');
    expect(sheet?.text).toContain('Saldo pendiente');
    expect(sheet?.text).toContain('<v>1234.56</v>');
    expect(sheet?.text).toContain('<v>12</v>');
    expect(sheet?.text).toContain('<mergeCell ref="A1:B1"/>');
    expect(sheet?.text).toContain('state="frozen"');
    expect(sheet?.text).toContain('customWidth="1"');
  });

  it('aplica el formato de moneda según la moneda del reporte', () => {
    const nio = buildSample('NIO').find((entry) => entry.name === 'xl/styles.xml')?.text ?? '';
    const usd = buildSample('USD').find((entry) => entry.name === 'xl/styles.xml')?.text ?? '';

    expect(nio).toContain('&quot;C$&quot;');
    expect(usd).toContain('&quot;$&quot;');
    expect(nio).toContain('formatCode="0.00&quot;%&quot;"');
  });

  it('normaliza el nombre del archivo con la empresa', () => {
    expect(safeFileName('Financiera Demo')).toBe('Financiera Demo');
    expect(safeFileName('Créditos / Ándres: S.A.')).toBe('Creditos Andres S.A.');
  });
});
