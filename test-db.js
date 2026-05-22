import mongoose from 'mongoose';
import dns from 'dns';

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  console.warn('DNS server config warning:', e.message);
}

const uris = [
  { name: 'Original in .env', uri: 'mongodb+srv://db_Visole7860:db_Visole7860@cluster0.jfjrnu9.mongodb.net/?appName=Cluster0' },
  { name: 'Original with db name', uri: 'mongodb+srv://db_Visole7860:db_Visole7860@cluster0.jfjrnu9.mongodb.net/poster?appName=Cluster0' },
  { name: 'User db_Visole7860, Pass Visole@7860 (Encoded)', uri: 'mongodb+srv://db_Visole7860:Visole%407860@cluster0.jfjrnu9.mongodb.net/?appName=Cluster0' },
  { name: 'User db_Visole7860, Pass Visole@7860 (Encoded) with db name', uri: 'mongodb+srv://db_Visole7860:Visole%407860@cluster0.jfjrnu9.mongodb.net/poster?appName=Cluster0' },
  { name: 'User db_Visole, Pass Visole@7860 (Encoded)', uri: 'mongodb+srv://db_Visole:Visole%407860@cluster0.jfjrnu9.mongodb.net/?appName=Cluster0' },
  { name: 'User db_Visole, Pass db_Visole', uri: 'mongodb+srv://db_Visole:db_Visole@cluster0.jfjrnu9.mongodb.net/?appName=Cluster0' },
  { name: 'User UmarLDS, Pass Visole@7860 (Encoded)', uri: 'mongodb+srv://UmarLDS:Visole%407860@cluster0.jfjrnu9.mongodb.net/?appName=Cluster0' }
];

async function testAll() {
  for (const item of uris) {
    console.log(`\nTesting: ${item.name}...`);
    try {
      // Connect with a 5 second timeout to fail fast
      await mongoose.connect(item.uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`✅ SUCCESS: Connected with ${item.name}`);
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }
  console.log('\nAll connections failed.');
  process.exit(1);
}

testAll();
