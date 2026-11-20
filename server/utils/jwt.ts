import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

export const AUTH_COOKIE_NAME = 'amblyocare_token';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'amblyocare-dev-jwt-secret-change-in-production';
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.includes('https')) return true;
  return process.env.NODE_ENV === 'production';
}

export function setAuthCookie(req: Request, res: Response, token: string): void {
  const secure = isSecureRequest(req);
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(req: Request, res: Response): void {
  const secure = isSecureRequest(req);
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
  });
}
