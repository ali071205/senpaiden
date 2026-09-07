import crypto from 'crypto';

const MAGIC_HEADER = Buffer.from('SEN1');

function getSecretKey(): Buffer {
  const secret = process.env.STORAGE_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('STORAGE_ENCRYPTION_SECRET environment variable is required for image decryption.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Decrypt buffer if encrypted with AES-256-GCM, otherwise return raw buffer
 */
export function decryptBuffer(buffer: Buffer): Buffer {
  if (buffer.length < 32 || !buffer.subarray(0, 4).equals(MAGIC_HEADER)) {
    return buffer; // Not encrypted, return original
  }

  try {
    const key = getSecretKey();
    const iv = buffer.subarray(4, 16);
    const tag = buffer.subarray(16, 32);
    const ciphertext = buffer.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err: any) {
    console.error('[Crypto] Decryption failed:', err?.message);
    return buffer;
  }
}
