#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { flattenObject } from './transforms';
import { validateDirectory, findFilesWithExtension, readExcelData, ensureOutputDirectory } from './utils';
import { loadFieldOptions, validateData, reportValidationErrors } from './validation';

/**
 * Transform from JSON - Convert JSON files to XLSX
 */
async function transform_from_json(dirPath: string): Promise<void> {
  try {
    // Validate directory
    const resolvedPath = validateDirectory(dirPath);
    
    // Load field options for validation
    const fieldOptions = loadFieldOptions();
    
    // Create output directory
    const outputDir = ensureOutputDirectory(resolvedPath);
    
    // Find JSON files
    const jsonFiles = findFilesWithExtension(resolvedPath, '.json');
    
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
          // Report validation errors
          reportValidationErrors(file, validationErrors, 'JSON');
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
        
        // Get column headers
        const headers = Object.keys(flattenedData[0] || {});
        
        // Add header row with bold formatting and wide columns (4x default = 40)
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
        await workbook.xlsx.writeFile(outputPath);
        
        // Get file sizes for reporting
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        const formatSize = (bytes: number) => (bytes / 1024).toFixed(2) + ' KB';
        
        console.log(`✅ ${file} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
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
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Transform from Table - Convert XLSX files to JSON
 */
async function transform_from_table(dirPath: string): Promise<void> {
  try {
    // Validate directory
    const resolvedPath = validateDirectory(dirPath);
    
    // Load field options for validation
    const fieldOptions = loadFieldOptions();
    
    // Create output directory
    const outputDir = ensureOutputDirectory(resolvedPath);
    
    // Find XLSX files
    const xlsxFiles = findFilesWithExtension(resolvedPath, '.xlsx');
    
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
        
        // Extract data using utility function
        const { rows } = readExcelData(worksheet);
        
        // Validate data for typos
        const validationErrors = validateData(rows, fieldOptions);
        
        if (validationErrors.length > 0) {
          // Report validation errors
          reportValidationErrors(file, validationErrors, 'XLSX');
          errorCount++;
          continue;
        }
        
        // Write JSON file
        fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8');
        
        // Get file sizes for reporting
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        const formatSize = (bytes: number) => (bytes / 1024).toFixed(2) + ' KB';
        
        console.log(`✅ ${file} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
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
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Configure CLI
program
  .name('transform')
  .description('CLI tool to transform and process JSON and XLSX files')
  .version('1.0.0');

program
  .option('--input-json <directory>', 'Directory containing JSON files to convert to XLSX')
  .option('--input-table <directory>', 'Directory containing XLSX files to convert to JSON')
  .action(async (options) => {
    if (options.inputJson) {
      await transform_from_json(options.inputJson);
    } else if (options.inputTable) {
      await transform_from_table(options.inputTable);
    } else {
      console.error('Error: You must specify either --input-json or --input-table');
      program.help();
    }
  });

// Only run CLI if this is the main module
if (require.main === module) {
  program.parse(process.argv);
  
  if (process.argv.length === 2) {
    program.help();
  }
}

// Export functions for testing
export { flattenObject, transform_from_json, transform_from_table };
// Re-export from transforms for backward compatibility
export { unflattenObject } from './transforms';
