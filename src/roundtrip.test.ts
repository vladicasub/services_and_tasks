import * as fs from 'fs';
import * as path from 'path';
import { transform_from_json, transform_from_table } from './index';

// Discover files dynamically
const inputJsonsDir = path.join(__dirname, '../input_jsons');
const inputTablesDir = path.join(__dirname, '../input_tables');

// Helper to get files in a directory (not subdirectories)
function getFilesInDirectory(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  return fs.readdirSync(dir)
    .filter(file => {
      const fullPath = path.join(dir, file);
      return fs.statSync(fullPath).isFile() && file.endsWith(extension);
    })
    .sort();
}

const jsonFiles = getFilesInDirectory(inputJsonsDir, '.json');
const xlsxFiles = getFilesInDirectory(inputTablesDir, '.xlsx');

// Test directory for cleanup
const jsonOutputsDir = path.join(inputJsonsDir, 'outputs');
const tableOutputsDir = path.join(inputTablesDir, 'outputs');

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

// TEST SUITE 1: JSON → XLSX → JSON (using actual transform functions)
describe('Roundtrip Tests: JSON → XLSX → JSON', () => {
  // Get ordered file list for processing
  const orderedJsonFiles = [
    'blueprint_task_products.json',
    'blueprint_tasks.json',
    'blueprint_services.json'
  ].filter(f => jsonFiles.includes(f));

  if (orderedJsonFiles.length === 0) {
    it('No JSON files found in input_jsons/', () => {
      expect(true).toBe(true);
    });
  } else {
    orderedJsonFiles.forEach((jsonFile, index) => {
      test(`${jsonFile}`, async () => {
        // Read original JSON
        const originalJsonPath = path.join(inputJsonsDir, jsonFile);
        const originalJson = JSON.parse(fs.readFileSync(originalJsonPath, 'utf-8'));
        const originalArray = Array.isArray(originalJson) ? originalJson : [originalJson];
        
        // Step 1: Transform all files in order (JSON → XLSX)
        const filePaths = orderedJsonFiles.slice(0, index + 1).map(f => path.join(inputJsonsDir, f));
        await transform_from_json(filePaths);
        
        // Step 2: Transform back (XLSX → JSON)
        const xlsxFile = jsonFile.replace('.json', '.xlsx');
        const xlsxPath = path.join(jsonOutputsDir, xlsxFile);
        
        expect(fs.existsSync(xlsxPath)).toBe(true);
        
        // Create temp copy to transform back
        const tempXlsxDir = path.join(__dirname, '../test_temp_xlsx');
        if (!fs.existsSync(tempXlsxDir)) {
          fs.mkdirSync(tempXlsxDir, { recursive: true });
        }
        
        const tempXlsxPath = path.join(tempXlsxDir, xlsxFile);
        fs.copyFileSync(xlsxPath, tempXlsxPath);
        
        // Transform XLSX files in order back to JSON
        const xlsxFilePaths = orderedJsonFiles.slice(0, index + 1).map(f => 
          path.join(tempXlsxDir, f.replace('.json', '.xlsx'))
        );
        
        // Copy all needed XLSX files
        for (let i = 0; i < index + 1; i++) {
          const srcFile = path.join(jsonOutputsDir, orderedJsonFiles[i].replace('.json', '.xlsx'));
          const dstFile = xlsxFilePaths[i];
          if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
            fs.copyFileSync(srcFile, dstFile);
          }
        }
        
        await transform_from_table(xlsxFilePaths);
        
        // Step 3: Read roundtrip JSON
        const roundtripJsonPath = path.join(tempXlsxDir, 'outputs', jsonFile);
        expect(fs.existsSync(roundtripJsonPath)).toBe(true);
        
        const roundtripJson = JSON.parse(fs.readFileSync(roundtripJsonPath, 'utf-8'));
        const roundtripArray = Array.isArray(roundtripJson) ? roundtripJson : [roundtripJson];
        
        // Step 4: Compare
        const normalizedOriginal = normalizeJson(originalArray);
        const normalizedRoundtrip = normalizeJson(roundtripArray);
        
        expect(normalizedRoundtrip).toEqual(normalizedOriginal);
        expect(roundtripArray.length).toBe(originalArray.length);
        
        // Cleanup temp directory
        if (fs.existsSync(tempXlsxDir)) {
          fs.rmSync(tempXlsxDir, { recursive: true, force: true });
        }
      });
    });
  }
});

// TEST SUITE 2: XLSX → JSON → XLSX (using actual transform functions)
describe('Roundtrip Tests: XLSX → JSON → XLSX', () => {
  // Get ordered file list for processing
  const orderedXlsxFiles = [
    'blueprint_task_products.xlsx',
    'blueprint_tasks.xlsx',
    'blueprint_services.xlsx'
  ].filter(f => xlsxFiles.includes(f));

  if (orderedXlsxFiles.length === 0) {
    it('No XLSX files found in input_tables/', () => {
      expect(true).toBe(true);
    });
  } else {
    orderedXlsxFiles.forEach((xlsxFile, index) => {
      test(`${xlsxFile}`, async () => {
        // Read original XLSX data
        const originalXlsxPath = path.join(inputTablesDir, xlsxFile);
        const originalData = fs.readFileSync(originalXlsxPath);
        
        // Step 1: Transform all files in order (XLSX → JSON)
        const filePaths = orderedXlsxFiles.slice(0, index + 1).map(f => path.join(inputTablesDir, f));
        await transform_from_table(filePaths);
        
        // Step 2: Transform back (JSON → XLSX)
        const jsonFile = xlsxFile.replace('.xlsx', '.json');
        const jsonPath = path.join(tableOutputsDir, jsonFile);
        
        expect(fs.existsSync(jsonPath)).toBe(true);
        
        // Create temp copy to transform back
        const tempJsonDir = path.join(__dirname, '../test_temp_json');
        if (!fs.existsSync(tempJsonDir)) {
          fs.mkdirSync(tempJsonDir, { recursive: true });
        }
        
        const tempJsonPath = path.join(tempJsonDir, jsonFile);
        fs.copyFileSync(jsonPath, tempJsonPath);
        
        // Transform JSON files in order back to XLSX
        const jsonFilePaths = orderedXlsxFiles.slice(0, index + 1).map(f => 
          path.join(tempJsonDir, f.replace('.xlsx', '.json'))
        );
        
        // Copy all needed JSON files
        for (let i = 0; i < index + 1; i++) {
          const srcFile = path.join(tableOutputsDir, orderedXlsxFiles[i].replace('.xlsx', '.json'));
          const dstFile = jsonFilePaths[i];
          if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
            fs.copyFileSync(srcFile, dstFile);
          }
        }
        
        await transform_from_json(jsonFilePaths);
        
        // Step 3: Read roundtrip XLSX
        const roundtripXlsxPath = path.join(tempJsonDir, 'outputs', xlsxFile);
        expect(fs.existsSync(roundtripXlsxPath)).toBe(true);
        
        const roundtripData = fs.readFileSync(roundtripXlsxPath);
        
        // Step 4: Compare file sizes (should be similar)
        const originalSize = originalData.length;
        const roundtripSize = roundtripData.length;
        
        // Allow 30% difference in file size (formatting may differ slightly)
        const sizeDiffPercent = Math.abs(originalSize - roundtripSize) / originalSize;
        expect(sizeDiffPercent).toBeLessThan(0.3);
        
        // Verify file exists and is not empty
        expect(roundtripSize).toBeGreaterThan(0);
        
        // Cleanup temp directory
        if (fs.existsSync(tempJsonDir)) {
          fs.rmSync(tempJsonDir, { recursive: true, force: true });
        }
      });
    });
  }
});
