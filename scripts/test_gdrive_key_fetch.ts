import dotenv from 'dotenv';
dotenv.config();

import { fetchFileFromGDrive } from '../frontend/src/lib/gdrive';

async function testFetch() {
  console.log('Testing GDrive fetch for sample slice...');
  const testFileId = '14EqExaEbmM0Qszj5Ste44j_28QQBGHkK';
  console.log(`Target File ID: ${testFileId}`);

  try {
    const buf = await fetchFileFromGDrive(testFileId);
    if (buf) {
      console.log(`✅ Success! Received buffer length: ${buf.length} bytes`);
      console.log(`   First 16 bytes:`, buf.subarray(0, 16).toString('hex'));
      // Check if it starts with WebP (RIFF....WEBP) or JPEG (ffd8) or PNG (89504e47)
      const isWebP = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
      console.log(`   Is Valid WebP: ${isWebP}`);
    } else {
      console.error(`❌ Failed: fetchFileFromGDrive returned null`);
    }
  } catch (err) {
    console.error(`❌ Exception during fetch:`, err);
  }
}

testFetch();
