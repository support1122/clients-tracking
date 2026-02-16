import { uploadOnboardingAttachment } from './cloudinary.js';
import { uploadToR2, isR2Url, extractR2Key, getOnboardingAssetSubfolder } from './r2Storage.js';
import dotenv from 'dotenv';

dotenv.config();

const USE_R2_FOR_NEW_UPLOADS = process.env.USE_R2_FOR_NEW_UPLOADS === 'true';

const ONBOARDING_ASSETS_BASE = 'onboarding-assets';

/**
 * Unified upload for onboarding attachments - R2 or Cloudinary
 * R2: files go under onboarding-assets/{images|pdf|others}/
 */
export async function uploadFile(fileBuffer, options = {}) {
  const {
    folder = ONBOARDING_ASSETS_BASE,
    filename = 'file',
    contentType = 'application/octet-stream',
    clientName = null,
    fileType = null,
  } = options;

  const subfolder = fileType || getOnboardingAssetSubfolder(contentType, filename);

  if (USE_R2_FOR_NEW_UPLOADS) {
    const result = await uploadToR2(fileBuffer, {
      folder,
      filename,
      contentType,
      clientName,
      fileType: subfolder,
    });
    if (!result.success) throw new Error(result.error);
    return { success: true, url: result.url, key: result.key, storage: 'r2' };
  }

  const result = await uploadOnboardingAttachment(fileBuffer, filename, contentType);
  return {
    success: true,
    url: result.secure_url || result.url,
    key: result.public_id,
    storage: 'cloudinary',
  };
}

export { isR2Url, extractR2Key };
