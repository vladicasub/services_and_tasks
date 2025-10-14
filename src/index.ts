#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { flattenObject } from './transforms';
import { 
  readExcelData, 
  formatSize,
  writeExcelData,
  reportSummary,
  waitForKeypress
} from './utils';
import { 
  loadFieldOptions, 
  validateData, 
  reportValidationErrors,
  initializeAvailableOptions,
  updateAvailableOptions,
  extractUniqueValues,
  buildTaskResponsibilities,
  buildTaskProductProducers,
  buildTaskProductEnhancements,
  updateAvailableOptionsRelationships,
  buildServiceSpecifications,
  updateAvailableOptionsServiceSpecs
} from './validation';
import { TransformSummary } from './types';

/**
 * Learning configuration for each blueprint file
 * Defines which fields to learn and whether to validate
 */
const LEARNING_CONFIG: Record<string, { learnFields: string[], validate: boolean }> = {
  'blueprint_task_products': { learnFields: ['taskProduct', 'enhancement-order'], validate: false },
  'blueprint_tasks': { learnFields: ['enhancement', 'responsibility_options', 'task'], validate: true },
  'blueprint_services': { learnFields: ['Service'], validate: true }
};

/**
 * Build and save relationship mappings after processing blueprint_tasks
 * @param fileBaseName - Name of the file being processed
 * @param taskProductsData - Data from blueprint_task_products
 * @param tasksData - Data from blueprint_tasks
 */
function buildAndSaveRelationshipsAfterTasks(
  fileBaseName: string,
  taskProductsData: any[],
  tasksData: any[]
): void {
  // Build relationships after processing blueprint_tasks (when we have both task_products and tasks data)
  if (fileBaseName === 'blueprint_tasks' && taskProductsData.length > 0 && tasksData.length > 0) {
    console.log('─'.repeat(80));
    console.log('🔗 Building relationships...');
    
    const taskResponsibilities = buildTaskResponsibilities(tasksData);
    const taskProductProducers = buildTaskProductProducers(tasksData);
    const taskProductEnhancements = buildTaskProductEnhancements(taskProductsData);
    
    updateAvailableOptionsRelationships(
      taskResponsibilities,
      taskProductProducers,
      taskProductEnhancements
    );
    
    console.log(`   ✅ Built ${Object.keys(taskResponsibilities).length} task → responsibilities mappings`);
    console.log(`   ✅ Built ${Object.keys(taskProductProducers).length} taskProduct → producers mappings`);
    console.log(`   ✅ Built ${Object.keys(taskProductEnhancements).length} taskProduct → enhancements mappings`);
  }
}

/**
 * Transform from JSON - Convert specified JSON files to XLSX with progressive learning
 * Processes files in the order provided on command line
 * @param filePaths - Array of JSON file paths to transform
 * @param stepMode - If true, wait for keypress after each file
 */
async function transform_from_json(filePaths: string[], stepMode: boolean = false): Promise<void> {
  try {
    console.log('\n🎓 Starting Transform with Progressive Learning...\n');
    
    // Step 1: Initialize available_options.json
    console.log('📝 Initializing available_options.json...');
    initializeAvailableOptions();
    
    // Wait for keypress if step mode is enabled (after initialization)
    if (stepMode) {
      await waitForKeypress();
    }
    
    // Determine output directory from first file
    const firstFile = filePaths[0];
    const firstDir = path.dirname(path.resolve(firstFile));
    const outputDir = path.join(firstDir, 'outputs');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Store data for relationship building and validation
    let taskProductsData: any[] = [];
    let tasksData: any[] = [];
    let servicesData: any[] = [];
    
    console.log('─'.repeat(80));
    
    for (const filePath of filePaths) {
      const resolvedPath = path.resolve(filePath);
      const fileName = path.basename(resolvedPath);
      const fileBaseName = fileName.replace('.json', '');
      
      // Get learning config for this file
      const config = LEARNING_CONFIG[fileBaseName] || { learnFields: [], validate: true };
      
      if (!fs.existsSync(resolvedPath)) {
        console.log(`⚠️  ${fileName} - Not found, skipping`);
        continue;
      }
      
      try {
        const outputFileName = fileName.replace('.json', '.xlsx');
        const outputPath = path.join(outputDir, outputFileName);
        
        // Read JSON file
        const jsonContent = fs.readFileSync(resolvedPath, 'utf-8');
        let jsonData;
        
        try {
          jsonData = JSON.parse(jsonContent);
        } catch (parseError) {
          console.log(`⚠️  ${fileName} - Invalid JSON, skipping`);
          errorCount++;
          continue;
        }
        
        // Handle empty or invalid JSON
        if (!jsonData || (Array.isArray(jsonData) && jsonData.length === 0)) {
          console.log(`⚠️  ${fileName} - Empty JSON, skipping`);
          errorCount++;
          continue;
        }
        
        // Convert to array for validation
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        // Store data for relationship building and validation
        if (fileBaseName === 'blueprint_task_products') {
          taskProductsData = dataArray;
        } else if (fileBaseName === 'blueprint_tasks') {
          tasksData = dataArray;
        } else if (fileBaseName === 'blueprint_services') {
          servicesData = dataArray;
        }
        
        // Validate if required
        if (config.validate) {
          const fieldOptions = loadFieldOptions();
          // Add tasksData to fieldOptions for enhanced validation
          if (tasksData.length > 0) {
            (fieldOptions as any)['_tasksData'] = tasksData;
          }
          const validationErrors = validateData(dataArray, fieldOptions);
          
          if (validationErrors.length > 0) {
            reportValidationErrors(fileName, validationErrors, 'JSON');
            errorCount++;
            continue;
          }
        }
        
        // Learn from this file
        for (const fieldName of config.learnFields) {
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
          console.log(`⚠️  ${fileName} - Invalid JSON structure, skipping`);
          errorCount++;
          continue;
        }
        
        // Create Excel workbook using utility function
        const sheetName = fileBaseName.substring(0, 31);
        const workbook = await writeExcelData(flattenedData, {
          sheetName,
          columnWidth: 40,
          boldHeaders: true
        });
        
        // Write XLSX file
        await workbook.xlsx.writeFile(outputPath);
        
        const inputSize = fs.statSync(resolvedPath).size;
        const outputSize = fs.statSync(outputPath).size;
        
        console.log(`✅ ${fileName} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
        if (config.learnFields.length > 0) {
          console.log(`   📚 Learned: ${config.learnFields.join(', ')}`);
        }
        successCount++;
        
        // Build relationships if we just finished processing blueprint_tasks
        buildAndSaveRelationshipsAfterTasks(fileBaseName, taskProductsData, tasksData);
        
        // Build service specifications if we just finished processing blueprint_services
        if (fileBaseName === 'blueprint_services' && servicesData.length > 0) {
          console.log('─'.repeat(80));
          console.log('📋 Building service specifications...');
          
          const serviceSpecs = buildServiceSpecifications(servicesData);
          updateAvailableOptionsServiceSpecs(serviceSpecs);
          
          console.log(`   ✅ Built ${Object.keys(serviceSpecs).length} service specifications`);
        }
        
        // Wait for keypress if step mode is enabled
        if (stepMode) {
          await waitForKeypress();
        }
        
      } catch (error) {
        console.log(`❌ ${fileName} - Error: ${error}`);
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
 * Transform from Table - Convert specified XLSX files to JSON with progressive learning
 * Processes files in the order provided on command line
 * @param filePaths - Array of XLSX file paths to transform
 * @param stepMode - If true, wait for keypress after each file
 */
async function transform_from_table(filePaths: string[], stepMode: boolean = false): Promise<void> {
  try {
    console.log('\n🎓 Starting Transform with Progressive Learning...\n');
    
    // Step 1: Initialize available_options.json
    console.log('📝 Initializing available_options.json...');
    initializeAvailableOptions();
    
    // Wait for keypress if step mode is enabled (after initialization)
    if (stepMode) {
      await waitForKeypress();
    }
    
    // Determine output directory from first file
    const firstFile = filePaths[0];
    const firstDir = path.dirname(path.resolve(firstFile));
    const outputDir = path.join(firstDir, 'outputs');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Store data for relationship building
    let taskProductsData: any[] = [];
    let tasksData: any[] = [];
    let servicesData: any[] = [];
    
    console.log('─'.repeat(80));
    
    for (const filePath of filePaths) {
      const resolvedPath = path.resolve(filePath);
      const fileName = path.basename(resolvedPath);
      const fileBaseName = fileName.replace('.xlsx', '');
      
      // Get learning config for this file
      const config = LEARNING_CONFIG[fileBaseName] || { learnFields: [], validate: true };
      
      if (!fs.existsSync(resolvedPath)) {
        console.log(`⚠️  ${fileName} - Not found, skipping`);
        continue;
      }
      
      try {
        const outputFileName = fileName.replace('.xlsx', '.json');
        const outputPath = path.join(outputDir, outputFileName);
        
        // Read XLSX file
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(resolvedPath);
        
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          console.log(`⚠️  ${fileName} - No worksheet found, skipping`);
          errorCount++;
          continue;
        }
        
        const { rows } = readExcelData(worksheet);
        
        // Store data for relationship building
        if (fileBaseName === 'blueprint_task_products') {
          taskProductsData = rows;
        } else if (fileBaseName === 'blueprint_tasks') {
          tasksData = rows;
        } else if (fileBaseName === 'blueprint_services') {
          servicesData = rows;
        }
        
        // Validate if required
        if (config.validate) {
          const fieldOptions = loadFieldOptions();
          // Add tasksData to fieldOptions for enhanced validation
          if (tasksData.length > 0) {
            (fieldOptions as any)['_tasksData'] = tasksData;
          }
          const validationErrors = validateData(rows, fieldOptions);
          
          if (validationErrors.length > 0) {
            reportValidationErrors(fileName, validationErrors, 'XLSX');
            errorCount++;
            continue;
          }
        }
        
        // Learn from this file
        for (const fieldName of config.learnFields) {
          const values = extractUniqueValues(rows, fieldName);
          if (values.length > 0) {
            updateAvailableOptions(fieldName, values);
          }
        }
        
        // Write JSON output
        fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf-8');
        
        const inputSize = fs.statSync(resolvedPath).size;
        const outputSize = fs.statSync(outputPath).size;
        
        console.log(`✅ ${fileName} (${formatSize(inputSize)}) → ${outputFileName} (${formatSize(outputSize)})`);
        if (config.learnFields.length > 0) {
          console.log(`   📚 Learned: ${config.learnFields.join(', ')}`);
        }
        successCount++;
        
        // Build relationships if we just finished processing blueprint_tasks
        buildAndSaveRelationshipsAfterTasks(fileBaseName, taskProductsData, tasksData);
        
        // Build service specifications if we just finished processing blueprint_services
        if (fileBaseName === 'blueprint_services' && servicesData.length > 0) {
          console.log('─'.repeat(80));
          console.log('📋 Building service specifications...');
          
          const serviceSpecs = buildServiceSpecifications(servicesData);
          updateAvailableOptionsServiceSpecs(serviceSpecs);
          
          console.log(`   ✅ Built ${Object.keys(serviceSpecs).length} service specifications`);
        }
        
        // Wait for keypress if step mode is enabled
        if (stepMode) {
          await waitForKeypress();
        }
        
      } catch (error) {
        console.log(`❌ ${fileName} - Error: ${error}`);
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
  .option('--input-json <files...>', 'JSON files to convert to XLSX (space-separated)')
  .option('--input-table <files...>', 'XLSX files to convert to JSON (space-separated)')
  .option('--step', 'Wait for keypress after processing each file')
  .action(async (options) => {
    const stepMode = options.step || false;
    
    if (options.inputJson) {
      await transform_from_json(options.inputJson, stepMode);
    } else if (options.inputTable) {
      await transform_from_table(options.inputTable, stepMode);
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
