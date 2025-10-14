import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { flattenObject, unflattenObject } from './index';

describe('Roundtrip Tests - JSON → XLSX → JSON', () => {
  const testDir = path.join(__dirname, '../test_temp');
  const inputJsonsDir = path.join(__dirname, '../input_jsons');
  
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
   * Helper function to perform roundtrip conversion
   */
  async function performRoundtrip(jsonData: any[]): Promise<any[]> {
    const xlsxPath = path.join(testDir, 'temp.xlsx');
    
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
    const rows: any[] = [];
    const readHeaders: string[] = [];
    
    // Get headers from first row
    const readHeaderRow = readWorksheet.getRow(1);
    readHeaderRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      readHeaders[colNumber - 1] = String(cell.value);
    });
    
    // Get data rows
    readWorksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      
      const rowData: any = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = readHeaders[colNumber - 1];
        if (header) {
          rowData[header] = cell.value !== null ? cell.value : '';
        }
      });
      
      // Unflatten the object to restore arrays
      rows.push(unflattenObject(rowData));
    });
    
    return rows;
  }
  
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
  
  test('Roundtrip test for blueprint_tasks.json', async () => {
    // Read original JSON
    const tasksPath = path.join(inputJsonsDir, 'blueprint_tasks.json');
    const originalJson = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
    
    // Perform roundtrip conversion
    const roundtripJson = await performRoundtrip(originalJson);
    
    // Normalize both for comparison
    const normalizedOriginal = normalizeJson(originalJson);
    const normalizedRoundtrip = normalizeJson(roundtripJson);
    
    // Compare
    expect(normalizedRoundtrip).toEqual(normalizedOriginal);
    expect(roundtripJson.length).toBe(originalJson.length);
  });
  
  test('Roundtrip test for blueprint_task_products.json', async () => {
    // Read original JSON
    const productsPath = path.join(inputJsonsDir, 'blueprint_task_products.json');
    const originalJson = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
    
    // Perform roundtrip conversion
    const roundtripJson = await performRoundtrip(originalJson);
    
    // Normalize both for comparison
    const normalizedOriginal = normalizeJson(originalJson);
    const normalizedRoundtrip = normalizeJson(roundtripJson);
    
    // Compare
    expect(normalizedRoundtrip).toEqual(normalizedOriginal);
    expect(roundtripJson.length).toBe(originalJson.length);
  });
});

