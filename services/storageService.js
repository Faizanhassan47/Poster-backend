import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables relative to this file's location
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Ensure local uploads directory exists (fallback storage)
const localUploadsDir = path.join(__dirname, '../uploads/templates');
if (!fs.existsSync(localUploadsDir)) {
  fs.mkdirSync(localUploadsDir, { recursive: true });
}

let s3Client = null;
let bucketName = process.env.IDRIVE_BUCKET_NAME || 'dome-cloud';
let endpoint = process.env.IDRIVE_ENDPOINT || 'https://s3.idrivee2.com';
let region = process.env.IDRIVE_REGION || 'ap-southeast-1';

const initS3 = () => {
  const accessKeyId = process.env.IDRIVE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.IDRIVE_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey && bucketName && endpoint && region) {
    try {
      // Clean endpoint prefix if present (S3 client expects a protocol like https://)
      const cleanEndpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;

      s3Client = new S3Client({
        region,
        endpoint: cleanEndpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        // Required for some S3-compatible providers like iDrive E2
        forcePathStyle: false,
      });

      console.log('\x1b[32m%s\x1b[0m', '✅ iDrive E2 S3 Client successfully initialized.');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize iDrive E2 S3 Client:', error.message);
    }
  } else {
    console.log('\x1b[33m%s\x1b[0m', '⚠️  iDrive E2 S3 configuration not fully set in .env.');
    console.log('\x1b[36m%s\x1b[0m', 'ℹ️  Templates will be uploaded to local directory: backend/uploads/templates/');
  }
  return false;
};

// Initialize S3 on service startup
initS3();

/**
 * Uploads a template frame to either iDrive E2 S3 or local fallback storage
 * @param {Object} fileMulter - The multer file object
 * @returns {Promise<Object>} - Upload status, direct rendering URL, storage type, and file identifier
 */
export const uploadFile = async (fileMulter) => {
  // Re-check configuration on demand
  if (!s3Client) {
    initS3();
  }

  const filename = `${Date.now()}-${fileMulter.originalname.replace(/\s+/g, '_')}`;
  const localPath = path.join(localUploadsDir, filename);

  // Always save locally first as a fallback / local cache
  await fs.promises.writeFile(localPath, fileMulter.buffer);

  const localUrl = `/uploads/templates/${filename}`;
  let s3Promise = null;

  if (s3Client) {
    s3Promise = (async () => {
      console.log(`📤 Background uploading template "${filename}" to iDrive E2 Bucket: ${bucketName}...`);

      const uploadParams = {
        Bucket: bucketName,
        Key: filename,
        Body: fileMulter.buffer,
        ContentType: fileMulter.mimetype,
        // Set standard public-read ACL so Fabric.js can render it from the web client
        ACL: 'public-read',
      };

      await s3Client.send(new PutObjectCommand(uploadParams));

      // Construct direct access URL using virtual-host format
      const cleanEndpointDomain = endpoint.replace(/^https?:\/\//, '');
      const s3Url = `https://${bucketName}.${cleanEndpointDomain}/${filename}`;

      console.log(`✅ Background upload to iDrive E2 S3 successfully! Public URL: ${s3Url}`);

      // Delete local temporary cache file to free space
      try {
        await fs.promises.unlink(localPath);
      } catch (err) {
        // Ignored
      }

      return {
        url: s3Url,
        storage: 'idrive-e2'
      };
    })();
  }

  // Return instantly with local fallback url (will be served via express static server)
  return {
    url: localUrl,
    storage: 'local',
    fileId: filename,
    localPath: localPath,
    s3Promise
  };
};

/**
 * Deletes a template from local storage or iDrive E2 cloud S3
 * @param {Object} template - The template object from database
 * @returns {Promise<Boolean>}
 */
export const deleteFile = async (template) => {
  if (template.storage === 'idrive-e2') {
    // Re-check config
    if (!s3Client) initS3();

    if (s3Client) {
      try {
        console.log(`🗑️ Deleting object "${template.fileId}" from iDrive E2 Bucket: ${bucketName}...`);
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: template.fileId,
        }));
        console.log('✅ Object deleted from iDrive E2 S3.');
        return true;
      } catch (error) {
        console.error('❌ Failed to delete object from iDrive E2 S3:', error.message);
      }
    }
  }

  // Fallback / local delete
  const filename = template.fileId;
  const localPath = path.join(localUploadsDir, filename);
  try {
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
      console.log(`✅ Deleted local file: ${filename}`);
      return true;
    }
  } catch (error) {
    console.error(`❌ Failed to delete local file: ${localPath}`, error.message);
  }
  return false;
};

/**
 * Gets the active status of iDrive E2 connection
 * @returns {String}
 */
export const getStorageStatus = () => {
  return s3Client ? 'configured' : 'not-configured';
};
