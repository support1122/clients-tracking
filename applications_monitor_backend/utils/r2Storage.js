import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Configure Cloudflare R2 Client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

/** Base folder for onboarding uploads; subfolders: images, pdf, others */
const ONBOARDING_ASSETS_BASE = 'onboarding-assets';

/**
 * Get asset subfolder from mimetype or filename: 'images' | 'pdf' | 'others'
 */
export function getOnboardingAssetSubfolder(mimetype, filename = '') {
  const m = (mimetype || '').toLowerCase();
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'images';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  return 'others';
}

/**
 * Upload file to Cloudflare R2
 * For onboarding: use folder = ONBOARDING_ASSETS_BASE and fileType = images | pdf | others
 */
export async function uploadToR2(fileBuffer, options = {}) {
  try {
    const {
      folder = ONBOARDING_ASSETS_BASE,
      filename = 'file',
      contentType = 'application/octet-stream',
      clientName = null,
      fileType = 'others',
    } = options;

    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    let finalFolder = folder;
    if (clientName) {
      const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9._-]/g, '_');
      finalFolder = `${folder}/${sanitizedClientName}/${fileType}`;
    } else {
      finalFolder = `${folder}/${fileType}`;
    }

    const key = `${finalFolder}/${timestamp}_${randomString}_${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      Metadata: {
        originalName: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    await r2Client.send(command);

    let url;
    if (PUBLIC_URL) {
      const baseUrl = PUBLIC_URL.replace(/\/$/, '');
      const cleanKey = key.replace(/^\//, '').replace(/^test\//, '');
      url = `${baseUrl}/${cleanKey}`;
    } else {
      url = `https://${BUCKET_NAME}.r2.cloudflarestorage.com/${key}`;
    }

    return {
      success: true,
      url,
      key,
      bucket: BUCKET_NAME,
      size: fileBuffer.length,
      contentType,
      storage: 'r2',
    };
  } catch (error) {
    console.error('R2 upload error:', error);
    return {
      success: false,
      error: error.message,
      storage: 'r2',
    };
  }
}

export async function deleteFromR2(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await r2Client.send(command);
    return { success: true, key, storage: 'r2' };
  } catch (error) {
    console.error('R2 delete error:', error);
    return { success: false, error: error.message, storage: 'r2' };
  }
}

export function extractR2Key(urlOrKey) {
  if (!urlOrKey) return null;
  if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
    return urlOrKey.replace(/^\/+/, '').replace(/^test\//, '');
  }
  try {
    const urlObj = new URL(urlOrKey);
    let key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
    key = key.replace(/^test\//, '');
    return key;
  } catch {
    return null;
  }
}

export function isR2Url(url) {
  if (!url) return false;
  return url.includes('.r2.cloudflarestorage.com') || (PUBLIC_URL && url.startsWith(PUBLIC_URL));
}
