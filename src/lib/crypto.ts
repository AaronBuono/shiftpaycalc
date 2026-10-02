// AES-256-GCM for the Humanforce webcal URL, which contains an access token.
// ENCRYPTION_KEY is 32 random bytes, base64 encoded (`openssl rand -base64 32`).

const enc = new TextEncoder();
const dec = new TextDecoder();

async function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set.');
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(plain));
  return `v1.${Buffer.from(iv).toString('base64')}.${Buffer.from(cipher).toString('base64')}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  const [version, iv, cipher] = stored.split('.');
  if (version !== 'v1' || !iv || !cipher) throw new Error('Unrecognised encrypted value.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
    await key(),
    Buffer.from(cipher, 'base64'),
  );
  return dec.decode(plain);
}

/** For logs and UI: show the host only, never the tokenised path/query. */
export function redactUrl(url: string): string {
  try {
    return `${new URL(url.replace(/^webcals?:\/\//i, 'https://')).host}/…`;
  } catch {
    return '[calendar url]';
  }
}
