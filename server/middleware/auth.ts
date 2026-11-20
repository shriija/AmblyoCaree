import type { Request, Response, NextFunction } from 'express';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '../utils/jwt.ts';
import { repository, type UserRecord } from '../services/repository.ts';

export interface AuthenticatedRequest extends Request {
  user?: Omit<UserRecord, 'password'>;
  userId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      res.status(401).json({ message: 'Authentication required. Please sign in.' });
      return;
    }

    const decoded = verifyAuthToken(token);
    const user = await repository.findUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ message: 'Account not found or session expired.' });
      return;
    }

    const { password: _removed, ...safeUser } = user;
    req.user = safeUser;
    req.userId = user._id;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired authentication session.' });
  }
}
