import { JWT } from 'google-auth-library';
import { decryptBuffer } from './crypto';

let cachedToken: { token: string; expiresAt: number } | null = null;
const inFlightRequests = new Map<string, Promise<Buffer | null>>();

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  // 1. Prioritize User OAuth 2.0 Refresh Token (Uses 5TB User Account)
  const oauthClientId = process.env.GDRIVE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;

  if (oauthClientId && oauthClientSecret && refreshToken) {
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: oauthClientId,
          client_secret: oauthClientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
          };
          return data.access_token;
        }
      }
    } catch (err: any) {
      console.error('[GDrive OAuth] Token refresh error:', err?.message);
    }
  }

  // 2. Fallback to Service Account JWT
  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GDRIVE_PRIVATE_KEY;
  const jsonKey = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;

  try {
    let email = clientEmail;
    let key = privateKey;

    if (jsonKey) {
      const parsed = JSON.parse(jsonKey.startsWith('{') ? jsonKey : Buffer.from(jsonKey, 'base64').toString('utf-8'));
      email = parsed.client_email;
      key = parsed.private_key;
    }

    if (!email || !key) return null;

    key = key.replace(/\\n/g, '\n');

    const client = new JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const res = await client.authorize();
    if (res.access_token) {
      cachedToken = {
        token: res.access_token,
        expiresAt: res.expiry_date || Date.now() + 3500 * 1000,
      };
      return res.access_token;
    }
  } catch (err: any) {
    console.error('[GDrive Auth] Service account auth error:', err?.message);
  }

  return null;
}

/**
 * Single-Flight Coalesced Fetch from Google Drive with AES-256 Decryption
 */
export async function fetchFileFromGDrive(fileId: string): Promise<Buffer | null> {
  if (inFlightRequests.has(fileId)) {
    return inFlightRequests.get(fileId)!;
  }

  const fetchPromise = (async () => {
    try {
      const token = await getAccessToken();
      if (!token) return null;

      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.warn(`[GDrive] Fetch failed with status ${res.status} for fileId ${fileId}`);
        return null;
      }

      const rawArrayBuffer = await res.arrayBuffer();
      const rawBuffer = Buffer.from(rawArrayBuffer);

      // 🔓 In-memory AES-256 decryption
      const decrypted = decryptBuffer(rawBuffer);
      return decrypted;
    } catch (err: any) {
      console.error(`[GDrive] Exception fetching fileId ${fileId}:`, err?.message);
      return null;
    } finally {
      inFlightRequests.delete(fileId);
    }
  })();

  inFlightRequests.set(fileId, fetchPromise);
  return fetchPromise;
}

export function isGDriveConfigured(): boolean {
  return !!(
    (process.env.GDRIVE_OAUTH_CLIENT_ID && process.env.GDRIVE_OAUTH_CLIENT_SECRET && process.env.GDRIVE_REFRESH_TOKEN) ||
    process.env.GDRIVE_SERVICE_ACCOUNT_JSON ||
    (process.env.GDRIVE_CLIENT_EMAIL && process.env.GDRIVE_PRIVATE_KEY)
  );
}
