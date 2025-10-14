import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { flattenObject, unflattenObject } from './transforms';
import { extractCellText } from './utils';

// Discover files dynamically
const inputJsonsDir = path.join(__dirname, '../input_jsons');
const inputTablesDir = path.join(__dirname, '../input_tables');

// Get JSON files from input_jsons/ (not subdirectories)
function getJsonFiles(): string[] {
  if (!fs.existsSync(inputJsonsDir)) return [];
  
  const allFiles = fs.readdirSync(inputJsonsDir);
  return allFiles.filter(file => {
    const filePath = path.join(inputJsonsDir, file);
    const stat = fs.statSync(filePath);
    return stat.isFile() && file.toLowerCase().endsWith('.json');
  });
}

// Get XLSX files from input_tables/ (not subdirectories)
function getXlsxFiles(): string[] {
  if (!fs.existsSync(inputTablesDir)) return [];
  
  const allFiles = fs.readdirSync(inputTablesDir);
  return allFiles.filter(file => {
    const filePath = path.join(inputTablesDir, file);
    const stat = fs.statSync(filePath);
    return stat.isFile() && file.toLowerCase().endsWith('.xlsx');
  });
}

const jsonFiles = getJsonFiles();
const xlsxFiles = getXlsxFiles();

// Test directory for temporary files
const testDir = path.join(__dirname, '../test_temp');

beforeAll(() => {
  // Create test directory
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
});

afterAll(() => {
  // Clean up test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

/**
 * Helper function to normalize JSON for comparison
 * Handles empty arrays and string trimming
 */
function normalizeJson(data: any): any {
  if (Array.isArray(data)) {
    return data.map(item => normalizeJson(item));
  } else if (typeof data === 'object' && data !== null) {
    const normalized: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const value = data[key];
        if (Array.isArray(value)) {
          // Remove empty strings and trim
          normalized[key] = value.map(v => typeof v === 'string' ? v.trim() : v).filter(v => v !== '');
        } else if (typeof value === 'string') {
          normalized[key] = value.trim();
        } else {
          normalized[key] = normalizeJson(value);
        }
      }
    }
    return normalized;
  }
  return data;
}

/**
 * Helper function to read Excel data with proper cell text extraction
 */
function readExcelWorksheet(worksheet: ExcelJS.Worksheet): any[] {
  const headers: string[] = [];
  const rows: any[] = [];
  
  // Get headers from first row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value);
  });
  
  const maxCol = headers.length;
  
  // Get data rows
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    
    const rowData: any = {};
    // Explicitly iterate over all column indices to catch empty cells
    for (let colIdx = 1; colIdx <= maxCol; colIdx++) {
      const header = headers[colIdx - 1];
      if (header) {
        const cell = row.getCell(colIdx);
        rowData[header] = extractCellText(cell.value);
      }
    }
    
    // Unflatten the object to restore arrays
    rows.push(unflattenObject(rowData));
  });
  
  return rows;
}

/**
 * Perform JSON → XLSX → JSON roundtrip
 */
async function performJsonRoundtrip(jsonData: any[]): Promise<any[]> {
  const xlsxPath = path.join(testDir, 'temp_json_roundtrip.xlsx');
  
  // Step 1: Convert JSON to XLSX
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Test');
  
  // Flatten the data
  const flattenedData = jsonData.map(item => flattenObject(item));
  
  // Get column headers
  const headers = Object.keys(flattenedData[0] || {});
  
  // Add header row with bold formatting and wide columns
  worksheet.columns = headers.map(header => ({
    header: header,
    key: header,
    width: 40
  }));
  
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();
  
  // Add data rows
  flattenedData.forEach(row => {
    worksheet.addRow(row);
  });
  
  // Write XLSX file
  await workbook.xlsx.writeFile(xlsxPath);
  
  // Step 2: Convert XLSX back to JSON
  const readWorkbook = new ExcelJS.Workbook();
  await readWorkbook.xlsx.readFile(xlsxPath);
  
  const readWorksheet = readWorkbook.worksheets[0];
  const rows = readExcelWorksheet(readWorksheet);
  
  return rows;
}

/**
 * Perform XLSX → JSON → XLSX roundtrip
 */
async function performXlsxRoundtrip(xlsxPath: string): Promise<any[][]> {
  const jsonPath = path.join(testDir, 'temp_xlsx_roundtrip.json');
  const xlsxRoundtripPath = path.join(testDir, 'temp_xlsx_roundtrip.xlsx');
  
  // Step 1: Read original XLSX
  const originalWorkbook = new ExcelJS.Workbook();
  await originalWorkbook.xlsx.readFile(xlsxPath);
  const originalWorksheet = originalWorkbook.worksheets[0];
  
  // Extract original data
  const originalData = readExcelWorksheet(originalWorksheet);
  
  // Step 2: Convert to JSON (write to file)
  fs.writeFileSync(jsonPath, JSON.stringify(originalData, null, 2), 'utf-8');
  
  // Step 3: Read JSON back
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  
  // Step 4: Convert back to XLSX
  const roundtripWorkbook = new ExcelJS.Workbook();
  const roundtripWorksheet = roundtripWorkbook.addWorksheet('Test');
  
  const flattenedData = jsonData.map((item: any) => flattenObject(item));
  const headers = Object.keys(flattenedData[0] || {});
  
  roundtripWorksheet.columns = headers.map(header => ({
    header: header,
    key: header,
    width: 40
  }));
  
  const headerRow = roundtripWorksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();
  
  flattenedData.forEach((row: any) => {
    roundtripWorksheet.addRow(row);
  });
  
  await roundtripWorkbook.xlsx.writeFile(xlsxRoundtripPath);
  
  // Step 5: Read roundtrip XLSX
  const finalWorkbook = new ExcelJS.Workbook();
  await finalWorkbook.xlsx.readFile(xlsxRoundtripPath);
  const finalWorksheet = finalWorkbook.worksheets[0];
  
  const finalData = readExcelWorksheet(finalWorksheet);
  
  return [originalData, finalData];
}

// TEST SUITE 1: JSON → XLSX → JSON
describe('Roundtrip Tests: JSON → XLSX → JSON', () => {
  if (jsonFiles.length === 0) {
    it('No JSON files found in input_jsons/', () => {
      expect(true).toBe(true);
    });
  } else {
    jsonFiles.forEach(jsonFile => {
      test(`${jsonFile}`, async () => {
        const jsonPath = path.join(inputJsonsDir, jsonFile);
        const originalJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        
        // Handle both array and single object
        const dataArray = Array.isArray(originalJson) ? originalJson : [originalJson];
        
        // Perform roundtrip conversion
        const roundtripJson = await performJsonRoundtrip(dataArray);
        
        // Normalize both for comparison
        const normalizedOriginal = normalizeJson(dataArray);
        const normalizedRoundtrip = normalizeJson(roundtripJson);
        
        // Compare
        expect(normalizedRoundtrip).toEqual(normalizedOriginal);
        expect(roundtripJson.length).toBe(dataArray.length);
      });
    });
  }
});

// TEST SUITE 2: XLSX → JSON → XLSX
describe('Roundtrip Tests: XLSX → JSON → XLSX', () => {
  if (xlsxFiles.length === 0) {
    it('No XLSX files found in input_tables/', () => {
      expect(true).toBe(true);
    });
  } else {
    xlsxFiles.forEach(xlsxFile => {
      test(`${xlsxFile}`, async () => {
        const xlsxPath = path.join(inputTablesDir, xlsxFile);
        
        // Perform roundtrip conversion
        const [originalData, roundtripData] = await performXlsxRoundtrip(xlsxPath);
        
        // Normalize both for comparison
        const normalizedOriginal = normalizeJson(originalData);
        const normalizedRoundtrip = normalizeJson(roundtripData);
        
        // Compare
        expect(normalizedRoundtrip).toEqual(normalizedOriginal);
        expect(roundtripData.length).toBe(originalData.length);
      });
    });
  }
});
