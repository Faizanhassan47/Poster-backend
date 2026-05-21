import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { connectDB, getDbStatus, readTemplates, writeTemplates } from './config/db.js';

import { uploadFile, deleteFile, getStorageStatus } from './services/storageService.js';

// Load env variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'poster_studio_super_secret_jwt_key_123';

// Express Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer for in-memory file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Connect Database
connectDB();

// ==========================================
// 1. IN-MEMORY STORE (Users)
// ==========================================

const mockUsers = [
  {
    _id: 'admin-id-123',
    name: 'UmarLDS',
    email: 'UmarLDS',
    // bcrypt hash of "Visole@7860"
    password: bcrypt.hashSync('Visole@7860', 10),
    role: 'admin',
    createdAt: new Date()
  }
];

// ==========================================
// 2. DATABASE ACCESS INTERFACE
// ==========================================

const db = {
  // User operations (Static in-memory fallback, no database collection used)
  findUserByEmail: async (email) => {
    return mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  createUser: async ({ name, email, password, role = 'user' }) => {
    // Return the default admin user since registration is disabled
    return mockUsers[0];
  },

  // Template operations (Using JSON file database)
  getAllTemplates: async () => {
    const templates = readTemplates();
    return [...templates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  createTemplate: async ({ title, description, url, storage, fileId }) => {
    const templates = readTemplates();
    const newTemplate = {
      _id: `template-${Date.now()}`,
      title,
      description,
      url,
      storage,
      fileId,
      createdAt: new Date().toISOString()
    };
    templates.push(newTemplate);
    writeTemplates(templates);
    return newTemplate;
  },
  deleteTemplateById: async (id) => {
    const templates = readTemplates();
    const index = templates.findIndex(t => t._id === id);
    if (index !== -1) {
      const template = templates[index];
      await deleteFile(template);
      templates.splice(index, 1);
      writeTemplates(templates);
      return true;
    }
    return false;
  }
};

// ==========================================
// 4. AUTHENTICATION MIDDLEWARE
// ==========================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access Denied: No Token Provided' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid or Expired Token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access Denied: Admins Only' });
  }
};

// ==========================================
// 5. REST API ROUTE HANDLERS
// ==========================================

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  res.status(403).json({ message: 'Registration is disabled. Only the default administrator account (UmarLDS) is permitted.' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
});

// Get current user info from token
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// Database and Service Status Route
app.get('/api/status', (req, res) => {
  res.json({
    database: getDbStatus(),
    storage: getStorageStatus(),
    timestamp: new Date()
  });
});

// Template Gallery Routes
app.get('/api/templates', async (req, res) => {
  try {
    const templates = await db.getAllTemplates();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve templates', error: error.message });
  }
});

// Admin Route: Add Template
app.post('/api/templates', authenticateToken, adminOnly, upload.single('templateImage'), async (req, res) => {
  const { title, description } = req.body;
  const file = req.file;

  if (!title) {
    return res.status(400).json({ message: 'Template title is required' });
  }
  if (!file) {
    return res.status(400).json({ message: 'Template image is required' });
  }

  try {
    // Upload image file through Drive Service
    const uploadResult = await uploadFile(file);

    // Save template definition to DB
    const template = await db.createTemplate({
      title,
      description: description || '',
      url: uploadResult.url,
      storage: uploadResult.storage,
      fileId: uploadResult.fileId
    });

    res.status(201).json({
      message: 'Template added successfully',
      template
    });
  } catch (error) {
    console.error('❌ Template upload handler failed:', error);
    res.status(500).json({ message: 'Failed to upload template', error: error.message });
  }
});

// Admin Route: Delete Template
app.delete('/api/templates/:id', authenticateToken, adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const success = await db.deleteTemplateById(id);
    if (success) {
      res.json({ message: 'Template deleted successfully' });
    } else {
      res.status(404).json({ message: 'Template not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete template', error: error.message });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log('\x1b[35m%s\x1b[0m', `🚀 Poster Studio Express Server running on http://0.0.0.0:${PORT}`);
});
