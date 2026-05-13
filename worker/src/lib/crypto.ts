import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCODING = 'hex' as const;
const ENCRYPTED_PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
    const key = process.env.BEIN_ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
        throw new Error(
            'BEIN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). '
            + "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    return Buffer.from(key, 'hex');
}

/**
 * Decrypt a secret string encrypted with AES-256-GCM
 * Legacy iv:tag:ciphertext values are still supported for existing passwords.
 * Plaintext fallback is a bounded transition path for pre-backfill data only.
 */
export function decryptSecret(encrypted: string): string {
    if (encrypted.startsWith(ENCRYPTED_PREFIX)) {
        return decryptPayload(encrypted.slice(ENCRYPTED_PREFIX.length));
    }

    if (isLegacyEncryptedSecret(encrypted)) {
        return decryptPayload(encrypted);
    }

    if (process.env.BEIN_ALLOW_PLAINTEXT_CREDENTIALS === 'true') {
        return encrypted;
    }

    throw new Error(
        'Plaintext beIN credential found. Run scripts/backfill-credential-encryption.ts, '
        + 'then keep BEIN_ALLOW_PLAINTEXT_CREDENTIALS unset.'
    );
}

function isLegacyEncryptedSecret(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) return false;
    const [ivHex, tagHex, ciphertext] = parts;
    return ivHex.length === 32 &&
        tagHex.length === 32 &&
        ciphertext.length > 0 &&
        parts.every(part => /^[0-9a-f]+$/i.test(part));
}

function decryptPayload(payload: string): string {
    const key = getEncryptionKey();
    const [ivHex, tagHex, ciphertext] = payload.split(':');

    const iv = Buffer.from(ivHex, ENCODING);
    const tag = Buffer.from(tagHex, ENCODING);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Interface for a beIN account with a password field
 */
interface AccountWithPassword {
    password: string;
    totpSecret?: string | null;
    proxy?: {
        password?: string | null;
        [key: string]: unknown;
    } | null;
    [key: string]: unknown;
}

/**
 * Decrypt the password field of a beIN account in-place
 * Call this once after loading the account from DB, before any login attempts
 */
export function decryptAccountPassword<T extends AccountWithPassword>(account: T): T {
    return {
        ...account,
        password: decryptSecret(account.password),
        totpSecret: account.totpSecret ? decryptSecret(account.totpSecret) : account.totpSecret,
        proxy: account.proxy
            ? {
                ...account.proxy,
                password: account.proxy.password ? decryptSecret(account.proxy.password) : account.proxy.password,
            }
            : account.proxy,
    } as T;
}
