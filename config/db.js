import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path for local JSON templates storage
const dbPath = path.join(__dirname, '../uploads/templates.json');

export const connectDB = async () => {
  try {
    // Ensure the uploads directory exists
    const uploadsDir = path.dirname(dbPath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Ensure templates.json exists
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([], null, 2), 'utf-8');
    }
    
    console.log('\x1b[32m%s\x1b[0m', '✅ Local JSON Database Initialized: ' + dbPath);
    return true;
  } catch (error) {
    console.error('❌ JSON Database Initialization Error:', error.message);
    return false;
  }
};

export const getDbStatus = () => {
  return 'connected';
};

// Reads templates from JSON file
export const readTemplates = () => {
  try {
    if (!fs.existsSync(dbPath)) {
      return [];
    }
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to read templates database:', error.message);
    return [];
  }
};

// Writes templates to JSON file
export const writeTemplates = (templates) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(templates, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('❌ Failed to write templates database:', error.message);
    return false;
  }
};
