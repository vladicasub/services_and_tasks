/**
 * Data validation and typo detection utilities
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Validation error interface
 */
export interface ValidationError {
  row: number;
  field: string;
  value: string;
  validOptions: string[];
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for finding similar strings (typo suggestions)
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
 * @param value - The value to match
 * @param options - Array of valid options
 * @param maxSuggestions - Maximum number of suggestions to return
 * @returns Array of closest matches
 */
export function findClosestMatches(value: string, options: string[], maxSuggestions: number = 3): string[] {
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
 * Load field options from available_options.json (dynamically built) or field_options.json (static)
 * @returns Object mapping field names to allowed values
 */
export function loadFieldOptions(): Record<string, string[]> {
  // First try to load available_options.json (dynamically built during runtime)
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Fall through to try field_options.json
    }
  }
  
  // Fall back to field_options.json
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
 * Initialize available_options.json with empty object
 */
export function initializeAvailableOptions(): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  fs.writeFileSync(availableOptionsPath, JSON.stringify({}, null, 2), 'utf-8');
}

/**
 * Update available_options.json with learned field values
 * @param fieldName - Name of the field (e.g., 'taskProduct', 'task')
 * @param values - Array of unique values to add
 */
export function updateAvailableOptions(fieldName: string, values: string[]): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  let currentOptions: Record<string, string[]> = {};
  
  // Load current options
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      currentOptions = JSON.parse(content);
    } catch (error) {
      // Start fresh if file is corrupted
      currentOptions = {};
    }
  }
  
  // Update with new values (sorted and unique)
  const existingValues = currentOptions[fieldName] || [];
  const combinedValues = [...new Set([...existingValues, ...values])];
  currentOptions[fieldName] = combinedValues.sort();
  
  // Write back
  fs.writeFileSync(availableOptionsPath, JSON.stringify(currentOptions, null, 2), 'utf-8');
}

/**
 * Extract unique values from data for a specific field
 * @param rows - Array of data rows
 * @param fieldName - Name of the field to extract
 * @returns Array of unique values
 */
export function extractUniqueValues(rows: any[], fieldName: string): string[] {
  const values = new Set<string>();
  
  rows.forEach(row => {
    const fieldValue = row[fieldName];
    if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
      if (Array.isArray(fieldValue)) {
        fieldValue.forEach(v => {
          const trimmed = String(v).trim();
          if (trimmed) values.add(trimmed);
        });
      } else {
        const trimmed = String(fieldValue).trim();
        if (trimmed) values.add(trimmed);
      }
    }
  });
  
  return Array.from(values).sort();
}

/**
 * Validate data against field options
 * @param rows - Array of data rows to validate
 * @param fieldOptions - Object containing allowed values for each field
 * @returns Array of validation errors
 */
export function validateData(rows: any[], fieldOptions: Record<string, string[]>): ValidationError[] {
  const errors: ValidationError[] = [];
  
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
 * Report validation errors to console in a formatted way
 * @param file - Filename being validated
 * @param errors - Array of validation errors
 * @param sourceType - Type of source ('JSON' or 'XLSX')
 */
export function reportValidationErrors(file: string, errors: ValidationError[], sourceType: 'JSON' | 'XLSX' = 'XLSX'): void {
  console.log(`❌ ${file} - VALIDATION FAILED - Typos detected!`);
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('  ║                         TYPO DETECTION REPORT                         ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  errors.forEach((error, idx) => {
    console.log(`  Typo #${idx + 1}:`);
    
    // Format location based on source type
    if (sourceType === 'JSON') {
      console.log(`  ├─ Location: Record ${error.row - 1} (JSON array index ${error.row - 2})`);
    } else {
      console.log(`  ├─ Location: Row ${error.row} (Excel row ${error.row})`);
    }
    
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
  
  console.log(`  Total typos found: ${errors.length}`);
  console.log(`  ⚠️  File transformation aborted due to validation errors.`);
  console.log('');
}

/**
 * Build relationship: for each task, what responsibilities are available
 */
export function buildTaskResponsibilities(tasksData: any[]): Record<string, string[]> {
  const taskResponsibilities: Record<string, string[]> = {};
  
  tasksData.forEach(taskRow => {
    const task = taskRow.task;
    const responsibilities = taskRow.responsibility_options;
    
    if (task && responsibilities) {
      const responsibilityArray = Array.isArray(responsibilities) ? responsibilities : [responsibilities];
      taskResponsibilities[task] = responsibilityArray.filter((r: string) => r && r.trim() !== '');
    }
  });
  
  return taskResponsibilities;
}

/**
 * Build relationship: for each taskProduct, which tasks can produce it (have it as output)
 */
export function buildTaskProductProducers(tasksData: any[]): Record<string, string[]> {
  const taskProductProducers: Record<string, string[]> = {};
  
  tasksData.forEach(taskRow => {
    const task = taskRow.task;
    const outputs = taskRow.outputs;
    
    if (task && outputs) {
      const outputArray = Array.isArray(outputs) ? outputs : [outputs];
      outputArray.forEach((output: string) => {
        if (output && output.trim() !== '') {
          if (!taskProductProducers[output]) {
            taskProductProducers[output] = [];
          }
          if (!taskProductProducers[output].includes(task)) {
            taskProductProducers[output].push(task);
          }
        }
      });
    }
  });
  
  return taskProductProducers;
}

/**
 * Build relationship: for each taskProduct, what enhancements are available
 */
export function buildTaskProductEnhancements(taskProductsData: any[]): Record<string, string[]> {
  const taskProductEnhancements: Record<string, string[]> = {};
  
  taskProductsData.forEach(row => {
    const taskProduct = row.taskProduct;
    const enhancementOrder = row['enhancement-order'];
    
    if (taskProduct) {
      const enhancements = Array.isArray(enhancementOrder) ? enhancementOrder : [];
      taskProductEnhancements[taskProduct] = enhancements.filter((e: string) => e && e.trim() !== '');
    }
  });
  
  return taskProductEnhancements;
}

/**
 * Update available_options.json with relationship mappings
 */
export function updateAvailableOptionsRelationships(
  taskResponsibilities: Record<string, string[]>,
  taskProductProducers: Record<string, string[]>,
  taskProductEnhancements: Record<string, string[]>
): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  let currentOptions: Record<string, any> = {};
  
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      currentOptions = JSON.parse(content);
    } catch (error) {
      currentOptions = {};
    }
  }
  
  // Add the relationship mappings
  currentOptions['task_responsibilities'] = taskResponsibilities;
  currentOptions['taskProduct_producers'] = taskProductProducers;
  currentOptions['taskProduct_enhancements'] = taskProductEnhancements;
  
  fs.writeFileSync(availableOptionsPath, JSON.stringify(currentOptions, null, 2), 'utf-8');
}

