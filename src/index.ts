#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

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
 * Transform from JSON - Convert JSON files to XLSX
 */
function transform_from_json(dirPath: string): void {
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
    
    jsonFiles.forEach((file) => {
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
          return;
        }
        
        // Handle empty or invalid JSON
        if (!jsonData || (Array.isArray(jsonData) && jsonData.length === 0)) {
          console.log(`⚠️  ${file} - Empty JSON, skipping`);
          errorCount++;
          return;
        }
        
        // Convert JSON to worksheet
        let worksheet: XLSX.WorkSheet;
        
        if (Array.isArray(jsonData)) {
          // Flatten nested arrays and objects for better Excel display
          const flattenedData = jsonData.map(item => flattenObject(item));
          worksheet = XLSX.utils.json_to_sheet(flattenedData);
        } else if (typeof jsonData === 'object') {
          // Handle single object - convert to array with one element
          const flattenedData = [flattenObject(jsonData)];
          worksheet = XLSX.utils.json_to_sheet(flattenedData);
        } else {
          console.log(`⚠️  ${file} - Invalid JSON structure, skipping`);
          errorCount++;
          return;
        }
        
        // Create workbook and add worksheet
        const workbook = XLSX.utils.book_new();
        
        // Generate sheet name from filename (without extension)
        const sheetName = file.replace('.json', '').substring(0, 31); // Excel sheet name limit is 31 chars
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        
        // Write to file
        XLSX.writeFile(workbook, outputPath);
        
        const inputSize = (fs.statSync(inputPath).size / 1024).toFixed(2);
        const outputSize = (fs.statSync(outputPath).size / 1024).toFixed(2);
        console.log(`✅ ${file} (${inputSize} KB) → ${outputFileName} (${outputSize} KB)`);
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${file} - Error: ${error}`);
        errorCount++;
      }
    });
    
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
 * Transform from Table - List all XLSX files in a directory
 */
function transform_from_table(dirPath: string): void {
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
    
    // Read all files in the directory and filter XLSX files
    const allFiles = fs.readdirSync(resolvedPath);
    const xlsxFiles = allFiles.filter(file => {
      const filePath = path.join(resolvedPath, file);
      const fileStats = fs.statSync(filePath);
      return fileStats.isFile() && file.toLowerCase().endsWith('.xlsx');
    });
    
    console.log(`\nXLSX files in '${dirPath}':`);
    console.log('─'.repeat(50));
    
    if (xlsxFiles.length === 0) {
      console.log('(no XLSX files found)');
    } else {
      xlsxFiles.forEach((file) => {
        const filePath = path.join(resolvedPath, file);
        const fileStats = fs.statSync(filePath);
        const sizeKB = (fileStats.size / 1024).toFixed(2);
        console.log(`📊 ${file} (${sizeKB} KB)`);
      });
    }
    
    console.log('─'.repeat(50));
    console.log(`Total: ${xlsxFiles.length} XLSX file(s)\n`);
    
  } catch (error) {
    console.error(`Error reading directory: ${error}`);
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
  .action((options) => {
    if (options.inputJson) {
      transform_from_json(options.inputJson);
    } else if (options.inputTable) {
      transform_from_table(options.inputTable);
    } else {
      console.error('Error: Either --input-json or --input-table option is required');
      program.help();
    }
  });

program.parse(process.argv);

// Show help if no arguments provided
if (process.argv.length === 2) {
  program.help();
}
