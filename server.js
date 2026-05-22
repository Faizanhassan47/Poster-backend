import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { connectDB, getDbStatus, User, Template } from './config/db.js';

import { uploadFile, deleteFile, getStorageStatus } from './services/storageService.js';

// Load env variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'poster_studio_super_secret_jwt_key_123';

// Express Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://main-55jd1gdt8-visolemarketing650-7817s-projects.vercel.app',
  'https://main-55jd1gdt8-visolemarketing650-7817s-projects.vercel.app/',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true); // Allow all for now; tighten in production
  },
  credentials: true
}));
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
// 1. DATABASE ACCESS INTERFACE (MongoDB Mongoose)
// ==========================================

const db = {
  // User operations querying MongoDB
  findUserByEmail: async (email) => {
    return await User.findOne({ email: email.toLowerCase() });
  },
  createUser: async ({ name, email, password, role = 'admin' }) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    return await User.create({
      name,
      email,
      password: hashedPassword,
      role
    });
  },

  // Template operations querying MongoDB
  getAllTemplates: async () => {
    return await Template.find().sort({ createdAt: -1 });
  },
  createTemplate: async ({ title, description, url, storage, fileId }) => {
    return await Template.create({
      title,
      description: description || '',
      url,
      storage,
      fileId
    });
  },
  deleteTemplateById: async (id) => {
    const template = await Template.findById(id);
    if (template) {
      await deleteFile(template);
      await Template.findByIdAndDelete(id);
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
  res.status(403).json({ message: 'Public registration is disabled. Admin accounts must be created from the Admin Console.' });
});

// Admin Route: Create multiple admin users (Only accessible by authenticated Admins)
app.post('/api/auth/create-admin', authenticateToken, adminOnly, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields (Name, Username/Email, and Password) are required.' });
  }

  try {
    const existingUser = await db.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'An admin user with this username/email already exists.' });
    }

    const newAdmin = await db.createUser({
      name,
      email,
      password,
      role: 'admin'
    });

    res.status(201).json({
      message: 'New admin user created successfully.',
      user: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create admin user.', error: error.message });
  }
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

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access Denied: Only administrator logins are allowed.' });
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

    // If an asynchronous S3 upload was started, wait for it in the background and update DB
    if (uploadResult.s3Promise) {
      uploadResult.s3Promise.then(async (s3Data) => {
        try {
          await Template.updateOne({ _id: template._id }, { url: s3Data.url, storage: s3Data.storage });
          console.log(`✅ Database updated with S3 URL for template ${template._id}`);
        } catch (dbErr) {
          console.error('❌ Failed to update DB with S3 URL:', dbErr);
        }
      }).catch(err => {
        console.error('❌ iDrive E2 background upload failed:', err.message);
      });
    }

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

// Serve frontend static assets from frontend/dist
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log('\x1b[35m%s\x1b[0m', `🚀 Poster Studio Express Server running on http://0.0.0.0:${PORT}`);
});
