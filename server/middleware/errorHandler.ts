import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof AppError
      ? err.message
      : process.env.NODE_ENV === 'production'
        ? 'An unexpected server error occurred.'
        : err.message || 'An unexpected server error occurred.';

  if (statusCode >= 500) {
    console.error('[AmblyoCare API Error]', err);
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
