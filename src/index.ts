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
import { 
  loadFieldOptions, 
  validateData, 
  reportValidationErrors,
  initializeAvailableOptions,
  updateAvailableOptions,
  extractUniqueValues
} from './validation';
import { TransformSummary } from './types';

/**
 * Transform from JSON - Convert JSON files to XLSX with progressive learning
 * Processes files in order: task_products -> tasks -> services
 * Builds available_options.json dynamically during runtime
 */
async function transform_from_json(dirPath: string): Promise<void> {
  try {
    console.log('\n🎓 Starting Transform with Progressive Learning...\n');
    
    // Step 1: Initialize available_options.json
    console.log('📝 Initializing available_options.json...');
    initializeAvailableOptions();
    
    // Validate directory
    const resolvedPath = validateDirectory(dirPath);
    const outputDir = ensureOutputDirectory(resolvedPath);
    
    // Define processing order
    const processingOrder = [
      { file: 'blueprint_task_products.json', learnFields: ['taskProduct', 'enhancement-order'], validate: false },
      { file: 'blueprint_tasks.json', learnFields: ['enhancement', 'responsibility_options', 'task'], validate: true },
      { file: 'blueprint_services.json', learnFields: [], validate: true }
    ];
    
    let successCount = 0;
    let errorCount = 0;
    
    console.log('─'.repeat(80));
    
    for (const step of processingOrder) {
      const inputPath = path.join(resolvedPath, step.file);
      
      if (!fs.existsSync(inputPath)) {
        console.log(`⚠️  ${step.file} - Not found, skipping`);
        continue;
      }
      
      try {
        const outputFileName = step.file.replace('.json', '.xlsx');
        const outputPath = path.join(outputDir, outputFileName);
        
        // Read JSON file
        const jsonContent = fs.readFileSync(inputPath, 'utf-8');
        let jsonData;
        
        try {
          jsonData = JSON.parse(jsonContent);
        } catch (parseError) {
          console.log(`⚠️  ${step.file} - Invalid JSON, skipping`);
          errorCount++;
          continue;
        }
        
        // Handle empty or invalid JSON
        if (!jsonData || (Array.isArray(jsonData) && jsonData.length === 0)) {
          console.log(`⚠️  ${step.file} - Empty JSON, skipping`);
          errorCount++;
          continue;
        }
        
        // Convert to array for validation
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        // Validate if required
        if (step.validate) {
          const fieldOptions = loadFieldOptions();
          const validationErrors = validateData(dataArray, fieldOptions);
          
          if (validationErrors.length > 0) {
            reportValidationErrors(step.file, validationErrors, 'JSON');
            errorCount++;
            continue;
          }
        }
        
        // Learn from this file
        for (const fieldName of step.learnFields) {
          const values = extractUniqueValues(dataArray, fieldName);
          if (values.length > 0) {
            updateAvailableOptions(fieldName, values);
          }
        }
        
        // Flatten the data
        let flattenedData: any[];
        if (Array.isArray(jsonData)) {
          flattenedData = jsonData.map(item => flattenObject(item));
        } else if (typeof jsonData === 'object') {
          flattenedData = [flattenObject(jsonData)];
        } else {
          console.log(`⚠️  ${step.file} - Invalid JSON structure, skipping`);
          errorCount++;
          continue;
        }
        
        // Create Excel workbook using utility function
        const sheetName = step.file.replace('.json', '').substring(0, 31);
        const workbook = await writeExcelData(flattenedData, {
          sheetName,
          columnWidth: 40,
          boldHeaders: true
        });
        
        // Write XLSX file
        await workbook.xlsx.writeFile(outputPath);
        
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        
        console.log(`✅ ${step.file} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
        if (step.learnFields.length > 0) {
          console.log(`   📚 Learned: ${step.learnFields.join(', ')}`);
        }
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${step.file} - Error: ${error}`);
        errorCount++;
      }
    }
    
    console.log('─'.repeat(80));
    
    // Report summary
    reportSummary({ successCount, errorCount, outputDir }, 'JSON to XLSX');
    console.log(`📋 Built: available_options.json\n`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Transform from Table - Convert XLSX files to JSON with progressive learning
 * Processes files in order: task_products -> tasks -> services
 * Builds available_options.json dynamically during runtime
 */
async function transform_from_table(dirPath: string): Promise<void> {
  try {
    console.log('\n🎓 Starting Transform with Progressive Learning...\n');
    
    // Step 1: Initialize available_options.json
    console.log('📝 Initializing available_options.json...');
    initializeAvailableOptions();
    
    // Validate directory
    const resolvedPath = validateDirectory(dirPath);
    const outputDir = ensureOutputDirectory(resolvedPath);
    
    // Define processing order
    const processingOrder = [
      { file: 'blueprint_task_products.xlsx', learnFields: ['taskProduct', 'enhancement-order'], validate: false },
      { file: 'blueprint_tasks.xlsx', learnFields: ['enhancement', 'responsibility_options', 'task'], validate: true },
      { file: 'blueprint_services.xlsx', learnFields: [], validate: true }
    ];
    
    let successCount = 0;
    let errorCount = 0;
    
    console.log('─'.repeat(80));
    
    for (const step of processingOrder) {
      const inputPath = path.join(resolvedPath, step.file);
      
      if (!fs.existsSync(inputPath)) {
        console.log(`⚠️  ${step.file} - Not found, skipping`);
        continue;
      }
      
      try {
        const outputFileName = step.file.replace('.xlsx', '.json');
        const outputPath = path.join(outputDir, outputFileName);
        
        // Read XLSX file
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(inputPath);
        
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          console.log(`⚠️  ${step.file} - No worksheet found, skipping`);
          errorCount++;
          continue;
        }
        
        const { rows } = readExcelData(worksheet);
        
        // Validate if required
        if (step.validate) {
          const fieldOptions = loadFieldOptions();
          const validationErrors = validateData(rows, fieldOptions);
          
          if (validationErrors.length > 0) {
            reportValidationErrors(step.file, validationErrors, 'XLSX');
            errorCount++;
            continue;
          }
        }
        
        // Learn from this file
        for (const fieldName of step.learnFields) {
          const values = extractUniqueValues(rows, fieldName);
          if (values.length > 0) {
            updateAvailableOptions(fieldName, values);
          }
        }
        
        // Write JSON output
        fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8');
        
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        
        console.log(`✅ ${step.file} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
        if (step.learnFields.length > 0) {
          console.log(`   📚 Learned: ${step.learnFields.join(', ')}`);
        }
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${step.file} - Error: ${error}`);
        errorCount++;
      }
    }
    
    console.log('─'.repeat(80));
    
    // Report summary
    reportSummary({ successCount, errorCount, outputDir }, 'XLSX to JSON');
    console.log(`📋 Built: available_options.json\n`);
    
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
