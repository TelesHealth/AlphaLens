import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const SALT_ROUNDS = 12;
const TOKEN_TTL = "7d";

function getJwtSecret(): string {
  const s = process.env.JWT_SECRET ?? process.env.SESSION_SECRET;
  if (!s) throw new Error("JWT_SECRET or SESSION_SECRET must be set");
  return s;
}

function getEncryptionKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be set");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }
  return buf;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
}

export function generateToken(userId: number, email: string, role: string): string {
  const payload: TokenPayload = { userId, email, role };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    if (typeof decoded?.userId !== "number" || !decoded.email || !decoded.role) return null;
    return { userId: decoded.userId, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

const ALG = "aes-256-gcm";

export function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString("base64");
}

export function decryptCredentials(payload: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 12 + 16) throw new Error("Invalid encrypted payload");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}
