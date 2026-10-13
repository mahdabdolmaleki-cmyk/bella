import { deflateRawSync } from "node:zlib";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const EXCEL_EPOCH_OFFSET = 25569;
const MAX_CELL_TEXT = 32767;

function xml(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let n = index;
  let name = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function excelDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getTime() / 86400000 + EXCEL_EPOCH_OFFSET;
}

function cellXml(reference, value, column = {}) {
  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}" t="inlineStr"><is><t></t></is></c>`;
  }

  if (column.type === "date") {
    const serial = excelDate(value);
    if (serial !== null) return `<c r="${reference}" s="2"><v>${serial.toFixed(8)}</v></c>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  // Inline strings are used deliberately: untrusted customer text is never
  // interpreted as a formula, and the workbook needs no sharedStrings part.
  const text = xml(String(value).slice(0, MAX_CELL_TEXT));
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function worksheetXml(sheetName, columns, rows) {
  const lastColumn = columnName(Math.max(1, columns.length));
  const lastRow = rows.length + 1;
  const colXml = columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(8, Math.min(60, Number(column.width) || 18))}" customWidth="1"/>`)
    .join("");
  const headerCells = columns
    .map((column, index) => cellXml(`${columnName(index + 1)}1`, column.header, { type: "header" }).replace(" t=\"inlineStr\"", ' s="1" t="inlineStr"'))
    .join("");
  const headerRow = `<row r="1" ht="30" customHeight="1">${headerCells}</row>`;
  const dataRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const cells = columns
        .map((column, columnIndex) => cellXml(`${columnName(columnIndex + 1)}${rowNumber}`, row[columnIndex], column))
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${colXml}</cols><sheetData>${headerRow}${dataRows}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  const dosDate = 0x0021; // 1980-01-01; deterministic and supported by Windows Excel.
  let localOffset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 file name
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([local, fileName, compressed]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([central, fileName]));
    localOffset += localEntry.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

/**
 * Build a small, dependency-free OOXML workbook (modern .xlsx) from rows.
 * String cells are inline strings, so values beginning with '=' stay inert.
 *
 * @param {{sheetName?: string, columns: Array<{header: string, width?: number, type?: string}>, rows: unknown[][]}} options
 * @returns {Buffer}
 */
export function createXlsxBuffer({ sheetName = "Sheet1", columns, rows }) {
  if (!Array.isArray(columns) || columns.length === 0) throw new TypeError("columns are required");
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");

  const safeSheetName = String(sheetName).replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet1";
  const workbook = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const workbookRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rootRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const styles = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6B2C4E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD4AF7C"/></left><right style="thin"><color rgb="FFD4AF7C"/></right><top style="thin"><color rgb="FFD4AF7C"/></top><bottom style="thin"><color rgb="FFD4AF7C"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  return zip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/styles.xml", content: styles },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(safeSheetName, columns, rows) },
  ]);
}
