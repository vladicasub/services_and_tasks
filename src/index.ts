#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

/**
 * Flatten nested objects and arrays for Excel display
 * Converts arrays to comma-separated strings
 * Converts nested objects to dot-notation strings
 */
function flattenObject(obj: any, prefix: string = ''): any {
  const flattened: any = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (Array.isArray(value)) {
        // Convert arrays to comma-separated strings
        if (value.length === 0) {
          flattened[newKey] = '';
        } else if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
          // Simple array of primitives
          flattened[newKey] = value.join(', ');
        } else {
          // Array of objects - convert to JSON string
          flattened[newKey] = JSON.stringify(value);
        }
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Nested object - flatten recursively
        const nested = flattenObject(value, newKey);
        Object.assign(flattened, nested);
      } else {
        // Primitive value
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

/**
 * Unflatten an object (reverse of flattenObject)
 * Converts comma-separated strings back to arrays
 */
function unflattenObject(obj: any): any {
  const result: any = {};
  
  // Known array fields that should be arrays
  const arrayFields = ['inputs', 'outputs', 'responsibility_options', 'enhancement-order'];
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      // If this is a known array field
      if (arrayFields.includes(key)) {
        if (value === '' || value === null || value === undefined) {
          result[key] = [];
        } else if (typeof value === 'string') {
          // Split by comma-space and trim each item
          result[key] = value.split(', ').map((item: string) => item.trim()).filter((item: string) => item !== '');
        } else {
          result[key] = value;
        }
      } else {
        // Not an array field, keep as is
        result[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Transform from JSON - Convert JSON files to XLSX
 */
async function transform_from_json(dirPath: string): Promise<void> {
  try {
    // Resolve the directory path
    const resolvedPath = path.resolve(dirPath);
    
    // Check if the directory exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: Directory '${dirPath}' does not exist`);
      process.exit(1);
    }
    
    // Check if it's actually a directory
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      console.error(`Error: '${dirPath}' is not a directory`);
      process.exit(1);
    }
    
    // Load field options for validation
    const fieldOptions = loadFieldOptions();
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(resolvedPath, 'outputs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Read all files in the directory and filter JSON files
    const allFiles = fs.readdirSync(resolvedPath);
    const jsonFiles = allFiles.filter(file => {
      const filePath = path.join(resolvedPath, file);
      const fileStats = fs.statSync(filePath);
      return fileStats.isFile() && file.toLowerCase().endsWith('.json');
    });
    
    console.log(`\n📊 Converting JSON files to XLSX...`);
    console.log('─'.repeat(80));
    
    if (jsonFiles.length === 0) {
      console.log('(no JSON files found)');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of jsonFiles) {
      try {
        const inputPath = path.join(resolvedPath, file);
        const outputFileName = file.replace('.json', '.xlsx');
        const outputPath = path.join(outputDir, outputFileName);
        
        // Read JSON file
        const jsonContent = fs.readFileSync(inputPath, 'utf-8');
        let jsonData;
        
        try {
          jsonData = JSON.parse(jsonContent);
        } catch (parseError) {
          console.log(`⚠️  ${file} - Invalid JSON, skipping`);
          errorCount++;
          continue;
        }
        
        // Handle empty or invalid JSON
        if (!jsonData || (Array.isArray(jsonData) && jsonData.length === 0)) {
          console.log(`⚠️  ${file} - Empty JSON, skipping`);
          errorCount++;
          continue;
        }
        
        // Convert to array for validation
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        // Validate data for typos BEFORE flattening
        const validationErrors = validateData(dataArray, fieldOptions);
        
        if (validationErrors.length > 0) {
          // Report validation errors verbosely
          console.log(`❌ ${file} - VALIDATION FAILED - Typos detected!`);
          console.log('');
          console.log('  ╔═══════════════════════════════════════════════════════════════════════╗');
          console.log('  ║                         TYPO DETECTION REPORT                         ║');
          console.log('  ╚═══════════════════════════════════════════════════════════════════════╝');
          console.log('');
          
          validationErrors.forEach((error, idx) => {
            console.log(`  Typo #${idx + 1}:`);
            console.log(`  ├─ Location: Record ${error.row - 1} (JSON array index ${error.row - 2})`);
            console.log(`  ├─ Field: "${error.field}"`);
            console.log(`  ├─ Invalid value: "${error.value}"`);
            console.log(`  ├─ Valid options (${error.validOptions.length}):`);
            
            // Show valid options, grouped if many
            if (error.validOptions.length <= 10) {
              error.validOptions.forEach(opt => {
                console.log(`  │    • ${opt}`);
              });
            } else {
              error.validOptions.slice(0, 5).forEach(opt => {
                console.log(`  │    • ${opt}`);
              });
              console.log(`  │    ... and ${error.validOptions.length - 5} more options`);
            }
            
            // Suggest close matches
            const suggestions = findClosestMatches(error.value, error.validOptions, 3);
            if (suggestions.length > 0) {
              console.log(`  └─ Did you mean:`);
              suggestions.forEach(sugg => {
                console.log(`       → "${sugg}"`);
              });
            } else {
              console.log(`  └─ No close matches found`);
            }
            console.log('');
          });
          
          console.log(`  Total typos found: ${validationErrors.length}`);
          console.log(`  ⚠️  File transformation aborted due to validation errors.`);
          console.log('');
          errorCount++;
          continue;
        }
        
        // Flatten the data
        let flattenedData: any[];
        if (Array.isArray(jsonData)) {
          flattenedData = jsonData.map(item => flattenObject(item));
        } else if (typeof jsonData === 'object') {
          flattenedData = [flattenObject(jsonData)];
        } else {
          console.log(`⚠️  ${file} - Invalid JSON structure, skipping`);
          errorCount++;
          continue;
        }
        
        // Create ExcelJS workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const sheetName = file.replace('.json', '').substring(0, 31);
        const worksheet = workbook.addWorksheet(sheetName);
        
        // Get column headers from the first object
        const headers = Object.keys(flattenedData[0] || {});
        
        // Add header row with bold formatting
        worksheet.columns = headers.map(header => ({
          header: header,
          key: header,
          width: 40 // 4x default width (default is ~10)
        }));
        
        // Make header row bold
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.commit();
        
        // Add data rows
        flattenedData.forEach(row => {
          worksheet.addRow(row);
        });
        
        // Write to file
        await workbook.xlsx.writeFile(outputPath);
        
        const inputSize = (fs.statSync(inputPath).size / 1024).toFixed(2);
        const outputSize = (fs.statSync(outputPath).size / 1024).toFixed(2);
        console.log(`✅ ${file} (${inputSize} KB) → ${outputFileName} (${outputSize} KB)`);
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${file} - Error: ${error}`);
        errorCount++;
      }
    }
    
    console.log('─'.repeat(80));
    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Success: ${successCount} file(s)`);
    console.log(`   ❌ Failed: ${errorCount} file(s)`);
    console.log(`   📁 Output directory: ${outputDir}\n`);
    
  } catch (error) {
    console.error(`Error processing directory: ${error}`);
    process.exit(1);
  }
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Find closest matches using Levenshtein distance
 */
function findClosestMatches(value: string, options: string[], maxSuggestions: number = 3): string[] {
  const valueLower = value.toLowerCase();
  
  // Calculate distance for each option
  const distances = options.map(option => ({
    option,
    distance: levenshteinDistance(valueLower, option.toLowerCase())
  }));
  
  // Sort by distance
  distances.sort((a, b) => a.distance - b.distance);
  
  // Return top matches that are reasonably close (distance <= 3)
  return distances
    .filter(d => d.distance <= 3)
    .slice(0, maxSuggestions)
    .map(d => d.option);
}

/**
 * Load field options from the configuration file
 */
function loadFieldOptions(): Record<string, string[]> {
  const fieldOptionsPath = path.join(__dirname, '../extras/field_options.json');
  try {
    const content = fs.readFileSync(fieldOptionsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  Warning: Could not load field_options.json. Validation disabled.`);
    return {};
  }
}

/**
 * Validate data against field options
 * Returns array of validation errors
 */
function validateData(rows: any[], fieldOptions: Record<string, string[]>): Array<{
  row: number;
  field: string;
  value: string;
  validOptions: string[];
}> {
  const errors: Array<{
    row: number;
    field: string;
    value: string;
    validOptions: string[];
  }> = [];
  
  // Fields that should be validated (array fields)
  const fieldsToValidate = ['inputs', 'outputs', 'enhancement', 'enhancement-order', 'responsibility_options', 'task', 'taskProduct'];
  
  rows.forEach((row, rowIndex) => {
    for (const field of fieldsToValidate) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        const fieldKey = field.replace(/-/g, '_'); // Handle field name variations
        const allowedOptions = fieldOptions[field] || fieldOptions[fieldKey];
        
        if (allowedOptions && allowedOptions.length > 0) {
          const values = Array.isArray(row[field]) ? row[field] : [row[field]];
          
          for (const value of values) {
            const trimmedValue = String(value).trim();
            if (trimmedValue && !allowedOptions.includes(trimmedValue)) {
              errors.push({
                row: rowIndex + 2, // +2 because: +1 for 0-index, +1 for header row
                field: field,
                value: trimmedValue,
                validOptions: allowedOptions
              });
            }
          }
        }
      }
    }
  });
  
  return errors;
}

/**
 * Helper function to extract plain text from Excel cell value
 * Handles richText objects that Excel creates for formatted cells
 */
function extractCellText(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) {
    return '';
  }
  
  // Handle richText objects (formatted cells in Excel)
  if (typeof cellValue === 'object' && cellValue.richText && Array.isArray(cellValue.richText)) {
    return cellValue.richText.map((rt: any) => rt.text || '').join('');
  }
  
  // Handle regular values
  return String(cellValue);
}

/**
 * Transform from Table - Convert XLSX files to JSON
 */
async function transform_from_table(dirPath: string): Promise<void> {
  try {
    // Resolve the directory path
    const resolvedPath = path.resolve(dirPath);
    
    // Check if the directory exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: Directory '${dirPath}' does not exist`);
      process.exit(1);
    }
    
    // Check if it's actually a directory
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      console.error(`Error: '${dirPath}' is not a directory`);
      process.exit(1);
    }
    
    // Load field options for validation
    const fieldOptions = loadFieldOptions();
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(resolvedPath, 'outputs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Read all files in the directory and filter XLSX files
    const allFiles = fs.readdirSync(resolvedPath);
    const xlsxFiles = allFiles.filter(file => {
      const filePath = path.join(resolvedPath, file);
      const fileStats = fs.statSync(filePath);
      return fileStats.isFile() && file.toLowerCase().endsWith('.xlsx');
    });
    
    console.log(`\n📊 Converting XLSX files to JSON...`);
    console.log('─'.repeat(80));
    
    if (xlsxFiles.length === 0) {
      console.log('(no XLSX files found)');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of xlsxFiles) {
      try {
        const inputPath = path.join(resolvedPath, file);
        const outputFileName = file.replace('.xlsx', '.json');
        const outputPath = path.join(outputDir, outputFileName);
        
        // Read XLSX file using ExcelJS
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(inputPath);
        
        // Get the first worksheet
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          console.log(`⚠️  ${file} - No worksheet found, skipping`);
          errorCount++;
          continue;
        }
        
        // Extract data as array of objects
        const rows: any[] = [];
        const headers: string[] = [];
        
        // Get headers from first row
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value);
        });
        
        // Find max column index from headers
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
              // Use extractCellText to handle richText objects
              rowData[header] = extractCellText(cell.value);
            }
          }
          
          // Unflatten the object to restore arrays
          rows.push(unflattenObject(rowData));
        });
        
        // Validate data for typos
        const validationErrors = validateData(rows, fieldOptions);
        
        if (validationErrors.length > 0) {
          // Report validation errors verbosely
          console.log(`❌ ${file} - VALIDATION FAILED - Typos detected!`);
          console.log('');
          console.log('  ╔═══════════════════════════════════════════════════════════════════════╗');
          console.log('  ║                         TYPO DETECTION REPORT                         ║');
          console.log('  ╚═══════════════════════════════════════════════════════════════════════╝');
          console.log('');
          
          validationErrors.forEach((error, idx) => {
            console.log(`  Typo #${idx + 1}:`);
            console.log(`  ├─ Location: Row ${error.row} (Excel row ${error.row})`);
            console.log(`  ├─ Field: "${error.field}"`);
            console.log(`  ├─ Invalid value: "${error.value}"`);
            console.log(`  ├─ Valid options (${error.validOptions.length}):`);
            
            // Show valid options, grouped if many
            if (error.validOptions.length <= 10) {
              error.validOptions.forEach(opt => {
                console.log(`  │    • ${opt}`);
              });
            } else {
              error.validOptions.slice(0, 5).forEach(opt => {
                console.log(`  │    • ${opt}`);
              });
              console.log(`  │    ... and ${error.validOptions.length - 5} more options`);
            }
            
            // Suggest close matches
            const suggestions = findClosestMatches(error.value, error.validOptions, 3);
            if (suggestions.length > 0) {
              console.log(`  └─ Did you mean:`);
              suggestions.forEach(sugg => {
                console.log(`       → "${sugg}"`);
              });
            } else {
              console.log(`  └─ No close matches found`);
            }
            console.log('');
          });
          
          console.log(`  Total typos found: ${validationErrors.length}`);
          console.log(`  ⚠️  File transformation aborted due to validation errors.`);
          console.log('');
          errorCount++;
          continue;
        }
        
        // Write to JSON file
        fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8');
        
        const inputSize = (fs.statSync(inputPath).size / 1024).toFixed(2);
        const outputSize = (fs.statSync(outputPath).size / 1024).toFixed(2);
        console.log(`✅ ${file} (${inputSize} KB) → ${outputFileName} (${outputSize} KB)`);
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${file} - Error: ${error}`);
        errorCount++;
      }
    }
    
    console.log('─'.repeat(80));
    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Success: ${successCount} file(s)`);
    console.log(`   ❌ Failed: ${errorCount} file(s)`);
    console.log(`   📁 Output directory: ${outputDir}\n`);
    
  } catch (error) {
    console.error(`Error processing directory: ${error}`);
    process.exit(1);
  }
}

// Configure CLI
program
  .name('transform')
  .description('CLI tool to transform and process JSON and Table files')
  .version('1.0.0');

program
  .option('-i, --input-json <directory>', 'Input directory containing JSON files')
  .option('-t, --input-table <directory>', 'Input directory containing XLSX files')
  .action(async (options) => {
    if (options.inputJson) {
      await transform_from_json(options.inputJson);
    } else if (options.inputTable) {
      await transform_from_table(options.inputTable);
    } else {
      console.error('Error: Either --input-json or --input-table option is required');
      program.help();
    }
  });

// Only run CLI if this is the main module
if (require.main === module) {
  program.parse(process.argv);

  // Show help if no arguments provided
  if (process.argv.length === 2) {
    program.help();
  }
}

// Export functions for testing
export { flattenObject, unflattenObject, transform_from_json, transform_from_table };
