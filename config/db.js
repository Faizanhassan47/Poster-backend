import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dns from 'dns';

// Ensure Node.js DNS resolution prioritizes IPv4 to avoid ECONNREFUSED with MongoDB Atlas
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Configure Node DNS to use public Google & Cloudflare servers as resolvers to bypass local SRV lookup blocks
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  console.warn('⚠️ Could not set public DNS servers, using system default:', e.message);
}

// Define Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  }, // Used as both username and email identifier
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const templateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  url: { type: String, required: true },
  storage: { type: String, required: true },
  fileId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Export Models
export const User = mongoose.model('User', userSchema);
export const Template = mongoose.model('Template', templateSchema);

export const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI || 'mongodb+srv://db_Visole7860:db_Visole7860@cluster0.jfjrnu9.mongodb.net/?appName=Cluster0';
    
    // Automatically clean up any raw angle bracket placeholders if present in env
    uri = uri.replace(/<([^>]+)>/g, '$1');

    console.log('🔄 Connecting to MongoDB Atlas (SRV)...');
    try {
      await mongoose.connect(uri);
      console.log('\x1b[32m%s\x1b[0m', '✅ MongoDB Connected Successfully');
      await seedDefaultAdmin();
      return true;
    } catch (srvError) {
      console.error('⚠️ MongoDB SRV Connection failed:', srvError.message);
      
      // If SRV lookup fails, try standard connection string using resolved Atlas hostnames
      if (srvError.message.includes('querySrv') || srvError.message.includes('ENOTFOUND') || srvError.message.includes('ECONNREFUSED')) {
        console.log('🔄 Attempting fallback standard connection string (bypassing SRV)...');
        
        let credentials = 'db_Visole7860:db_Visole7860';
        const match = uri.match(/mongodb\+srv:\/\/([^@]+)@/);
        if (match) {
          credentials = match[1];
        }
        
        // Construct the standard connection URI using direct hostnames
        const fallbackUri = `mongodb://${credentials}@ac-pzeunut-shard-00-00.jfjrnu9.mongodb.net:27017,ac-pzeunut-shard-00-01.jfjrnu9.mongodb.net:27017,ac-pzeunut-shard-00-02.jfjrnu9.mongodb.net:27017/poster?ssl=true&authSource=admin&retryWrite=true&w=majority`;
        
        await mongoose.connect(fallbackUri);
        console.log('\x1b[32m%s\x1b[0m', '✅ MongoDB Connected Successfully via Fallback standard URI');
        await seedDefaultAdmin();
        return true;
      }
      throw srvError;
    }
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    return false;
  }
};

export const getDbStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[mongoose.connection.readyState] || 'disconnected';
};

// Seed default admin user
const seedDefaultAdmin = async () => {
  try {
    const adminUsername = 'UmarLDS';
    const adminPassword = 'Visole@7860';

    // Check if user already exists
    const adminExists = await User.findOne({ email: adminUsername.toLowerCase() });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
        name: adminUsername,
        email: adminUsername,
        password: hashedPassword,
        role: 'admin'
      });
      console.log('\x1b[32m%s\x1b[0m', `👥 Default administrator "${adminUsername}" seeded successfully.`);
    } else {
      console.log('ℹ️  Default administrator account already exists in database.');
    }
  } catch (error) {
    console.error('❌ Failed to seed default administrator account:', error.message);
  }
};
