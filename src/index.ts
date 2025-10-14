#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

/**
 * List all files in a directory
 */
function listFilesInDirectory(dirPath: string): void {
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
    
    // Read all files in the directory
    const files = fs.readdirSync(resolvedPath);
    
    console.log(`\nFiles in '${dirPath}':`);
    console.log('─'.repeat(50));
    
    if (files.length === 0) {
      console.log('(empty directory)');
    } else {
      files.forEach((file) => {
        const filePath = path.join(resolvedPath, file);
        const fileStats = fs.statSync(filePath);
        
        if (fileStats.isDirectory()) {
          console.log(`📁 ${file}/`);
        } else {
          const sizeKB = (fileStats.size / 1024).toFixed(2);
          console.log(`📄 ${file} (${sizeKB} KB)`);
        }
      });
    }
    
    console.log('─'.repeat(50));
    console.log(`Total: ${files.length} item(s)\n`);
    
  } catch (error) {
    console.error(`Error reading directory: ${error}`);
    process.exit(1);
  }
}

// Configure CLI
program
  .name('transform')
  .description('CLI tool to transform and process JSON files')
  .version('1.0.0');

program
  .option('-i, --input-json <directory>', 'Input directory containing JSON files')
  .action((options) => {
    if (options.inputJson) {
      listFilesInDirectory(options.inputJson);
    } else {
      console.error('Error: --input-json option is required');
      program.help();
    }
  });

program.parse(process.argv);

// Show help if no arguments provided
if (process.argv.length === 2) {
  program.help();
}

