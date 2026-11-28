/**
 * Generador mínimo de libros XLSX (Office Open XML) sin dependencias.
 *
 * Construye un ZIP sin compresión con las partes mínimas que Excel necesita
 * (content types, relaciones, libro, hoja y estilos). No usa APIs de Node, así
 * que funciona igual en Workers y en pruebas.
 */

export type XlsxFormat = 'text' | 'integer' | 'money' | 'percent';

export interface XlsxCell {
  value: string | number | null;
  format?: XlsxFormat;
  bold?: boolean;
  /** Tamaño en puntos. */
  size?: number;
  /** Color de texto `RRGGBB`. */
  color?: string;
  /** Relleno `RRGGBB`. */
  fill?: string;
  align?: 'left' | 'center' | 'right';
  border?: boolean;
}

export interface XlsxColumn {
  width: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
  /** Alto de fila por índice (0-based). */
  heights?: number[];
  /** Rangos combinados, por ejemplo `A1:D1`. */
  merges?: string[];
  /** Filas fijas (inmovilizadas) desde arriba. */
  freezeRows?: number;
}

export interface XlsxOptions {
  currency?: 'NIO' | 'USD';
  creator?: string;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Letra de columna: 0 → A, 25 → Z, 26 → AA. */
function columnLetter(index: number): string {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function stripHash(color: string): string {
  return color.replace('#', '').toUpperCase();
}

// ---------------------------------------------------------------- Estilos

interface FontSpec {
  bold: boolean;
  size: number;
  color: string;
}

interface CellStyle {
  fontId: number;
  fillId: number;
  borderId: number;
  numFmtId: number;
  align: 'left' | 'center' | 'right' | null;
}

class StyleRegistry {
  private readonly fonts: FontSpec[] = [{ bold: false, size: 11, color: 'FF17211F' }];
  private readonly fontKeys = new Map<string, number>([[this.fontKey(this.fonts[0]!), 0]]);
  private readonly fills: string[] = ['none', 'gray125'];
  private readonly fillKeys = new Map<string, number>([
    ['none', 0],
    ['gray125', 1],
  ]);
  private readonly borders: boolean[] = [false];
  private readonly styles: CellStyle[] = [{ fontId: 0, fillId: 0, borderId: 0, numFmtId: 0, align: null }];
  private readonly styleKeys = new Map<string, number>([['0|0|0|0|', 0]]);
  private readonly moneyFormat: string;

  constructor(currency: 'NIO' | 'USD') {
    this.moneyFormat = currency === 'USD' ? '"$" #,##0.00' : '"C$" #,##0.00';
  }

  private fontKey(font: FontSpec): string {
    return `${font.bold}|${font.size}|${font.color}`;
  }

  private numFmtId(format: XlsxFormat | undefined): number {
    switch (format) {
      case 'integer':
        return 3; // #,##0
      case 'money':
        return 164; // formato propio
      case 'percent':
        return 165; // 0.00"%" — el valor ya viene en porcentaje
      default:
        return 0;
    }
  }

  register(cell: XlsxCell): number {
    const font: FontSpec = {
      bold: cell.bold ?? false,
      size: cell.size ?? 11,
      color: `FF${stripHash(cell.color ?? '17211F')}`,
    };
    const fontKey = this.fontKey(font);
    let fontId = this.fontKeys.get(fontKey);
    if (fontId === undefined) {
      fontId = this.fonts.push(font) - 1;
      this.fontKeys.set(fontKey, fontId);
    }

    const fillKey = cell.fill ? stripHash(cell.fill) : 'none';
    let fillId = this.fillKeys.get(fillKey);
    if (fillId === undefined) {
      fillId = this.fills.push(fillKey) - 1;
      this.fillKeys.set(fillKey, fillId);
    }

    let borderId = 0;
    if (cell.border) {
      if (!this.borders[1]) this.borders.push(true);
      borderId = this.borders.length - 1;
    }

    const style: CellStyle = {
      fontId,
      fillId,
      borderId,
      numFmtId: this.numFmtId(cell.format),
      align: cell.align ?? null,
    };
    const styleKey = `${style.fontId}|${style.fillId}|${style.borderId}|${style.numFmtId}|${style.align ?? ''}`;
    let styleId = this.styleKeys.get(styleKey);
    if (styleId === undefined) {
      styleId = this.styles.push(style) - 1;
      this.styleKeys.set(styleKey, styleId);
    }
    return styleId;
  }

  toXml(): string {
    const numFmts = `<numFmt numFmtId="164" formatCode="${esc(this.moneyFormat)}"/><numFmt numFmtId="165" formatCode="0.00&quot;%&quot;"/>`;

    const fonts = this.fonts
      .map(
        (font) =>
          `<font>${font.bold ? '<b/>' : ''}<sz val="${font.size}"/><color rgb="${font.color}"/><name val="Calibri"/><family val="2"/></font>`,
      )
      .join('');

    const fills = this.fills
      .map((fill) =>
        fill === 'none'
          ? '<fill><patternFill patternType="none"/></fill>'
          : fill === 'gray125'
            ? '<fill><patternFill patternType="gray125"/></fill>'
            : `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill}"/><bgColor indexed="64"/></patternFill></fill>`,
      )
      .join('');

    const borders = this.borders
      .map((thin) =>
        thin
          ? `<border><left style="thin"><color rgb="FFD8DED9"/></left><right style="thin"><color rgb="FFD8DED9"/></right><top style="thin"><color rgb="FFD8DED9"/></top><bottom style="thin"><color rgb="FFD8DED9"/></bottom><diagonal/></border>`
          : '<border><left/><right/><top/><bottom/><diagonal/></border>',
      )
      .join('');

    const xfs = this.styles
      .map((style) => {
        const alignment = style.align
          ? `<alignment horizontal="${style.align}" vertical="center"${style.align === 'left' ? '' : ''}/>`
          : '<alignment vertical="center"/>';
        return `<xf numFmtId="${style.numFmtId}" fontId="${style.fontId}" fillId="${style.fillId}" borderId="${style.borderId}" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`;
      })
      .join('');

    return `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><numFmts count="2">${numFmts}</numFmts><fonts count="${this.fonts.length}">${fonts}</fonts><fills count="${this.fills.length}">${fills}</fills><borders count="${this.borders.length}">${borders}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.styles.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

// ---------------------------------------------------------------- ZIP

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
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

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** ZIP con método «store» (sin compresión): suficiente y sin dependencias. */
function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const names = entries.map((entry) => encoder.encode(entry.name));
  const crcs = entries.map((entry) => crc32(entry.data));

  let total = 22;
  entries.forEach((entry, index) => {
    total += 30 + names[index]!.length + entry.data.length;
    total += 46 + names[index]!.length;
  });

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const writeU16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const writeU32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const writeBytes = (value: Uint8Array) => {
    bytes.set(value, offset);
    offset += value.length;
  };

  const DOS_DATE = 0x5021; // 2020-01-01
  const headers: Array<{ nameLength: number; offset: number }> = [];

  entries.forEach((entry, index) => {
    const name = names[index]!;
    const crc = crcs[index]!;
    headers.push({ nameLength: name.length, offset });
    writeU32(0x04034b50);
    writeU16(20);
    writeU16(0);
    writeU16(0);
    writeU16(0);
    writeU16(DOS_DATE);
    writeU32(crc);
    writeU32(entry.data.length);
    writeU32(entry.data.length);
    writeU16(name.length);
    writeU16(0);
    writeBytes(name);
    writeBytes(entry.data);
  });

  const centralStart = offset;
  entries.forEach((entry, index) => {
    const name = names[index]!;
    const header = headers[index]!;
    writeU32(0x02014b50);
    writeU16(20);
    writeU16(20);
    writeU16(0);
    writeU16(0);
    writeU16(0);
    writeU16(DOS_DATE);
    writeU32(crcs[index]!);
    writeU32(entry.data.length);
    writeU32(entry.data.length);
    writeU16(name.length);
    writeU16(0);
    writeU16(0);
    writeU16(0);
    writeU16(0);
    writeU32(0);
    writeU32(header.offset);
    writeBytes(name);
  });

  const centralSize = offset - centralStart;
  writeU32(0x06054b50);
  writeU16(0);
  writeU16(0);
  writeU16(entries.length);
  writeU16(entries.length);
  writeU32(centralSize);
  writeU32(centralStart);
  writeU16(0);

  return bytes;
}

// ---------------------------------------------------------------- Libro

export function buildXlsx(sheet: XlsxSheet, options: XlsxOptions = {}): Uint8Array {
  const encoder = new TextEncoder();
  const styles = new StyleRegistry(options.currency ?? 'NIO');
  const columnCount = Math.max(sheet.columns.length, ...sheet.rows.map((row) => row.length), 1);

  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const height = sheet.heights?.[rowIndex];
      const attributes = height ? ` ht="${height}" customHeight="1"` : '';
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnLetter(columnIndex)}${rowNumber}`;
          const styleId = styles.register(cell);
          if (cell.value === null || cell.value === undefined || cell.value === '') {
            return `<c r="${ref}" s="${styleId}"/>`;
          }
          if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
            return `<c r="${ref}" s="${styleId}"><v>${cell.value}</v></c>`;
          }
          return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${esc(String(cell.value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}"${attributes}>${cells}</row>`;
    })
    .join('');

  const lastRow = Math.max(sheet.rows.length, 1);
  const dimension = `A1:${columnLetter(columnCount - 1)}${lastRow}`;

  const cols = sheet.columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`)
    .join('');

  const pane = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';

  const sheetXml = `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rowsXml}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;

  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

  const rootRels = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="${esc(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`;

  return zipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(styles.toXml()) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
  ]);
}

/** Nombre de archivo seguro para `Content-Disposition`. */
export function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
