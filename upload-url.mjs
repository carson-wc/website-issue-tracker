import crypto from 'node:crypto';
import { authed, json, signUpload } from '../lib/shared.mjs';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

// Returns a one-time upload link for one screenshot (max 10 MB, set on the storage bucket).
export default async (req) => {
  if (!authed(req)) return json({ error: 'bad_passcode' }, 401);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const { contentType } = await req.json().catch(() => ({}));
  const ext = EXT[contentType];
  if (!ext) return json({ error: 'Screenshots must be PNG, JPG, GIF or WebP.' }, 400);
  const month = new Date().toISOString().slice(0, 7);
  const path = `t/${month}/${crypto.randomUUID()}.${ext}`;
  try {
    return json({ path, uploadUrl: await signUpload(path) });
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
};

export const config = { path: '/api/upload-url' };
