/**
 * Data transformation utilities for converting between nested and flat structures
 */

/**
 * Flatten nested objects and arrays for Excel display
 * Converts arrays to comma-separated strings
 * Converts nested objects to dot-notation strings
 */
export function flattenObject(obj: any, prefix: string = ''): any {
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
export function unflattenObject(obj: any): any {
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

