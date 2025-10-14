#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { flattenObject } from './transforms';
import { 
  validateDirectory, 
  findFilesWithExtension, 
  readExcelData, 
  ensureOutputDirectory,
  formatSize,
  writeExcelData,
  reportSummary
} from './utils';
import { loadFieldOptions, validateData, reportValidationErrors } from './validation';
import { TransformSummary } from './types';

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
        
        // Create Excel workbook using utility function
        const sheetName = file.replace('.json', '').substring(0, 31);
        const workbook = await writeExcelData(flattenedData, {
          sheetName,
          columnWidth: 40,
          boldHeaders: true
        });
        
        // Write XLSX file
        await workbook.xlsx.writeFile(outputPath);
        
        // Get file sizes for reporting
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        
        console.log(`✅ ${file} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${file} - Error: ${error}`);
        errorCount++;
      }
    }
    
    // Report summary
    reportSummary({ successCount, errorCount, outputDir }, 'JSON to XLSX');
    
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
        const ExcelJS = require('exceljs');
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
        
        console.log(`✅ ${file} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${file} - Error: ${error}`);
        errorCount++;
      }
    }
    
    // Report summary
    reportSummary({ successCount, errorCount, outputDir }, 'XLSX to JSON');
    
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
