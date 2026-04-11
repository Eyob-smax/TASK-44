import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/app-errors.js';

function buildDetails(error: ZodError): Record<string, string[]> {
  const flat = error.flatten();
  const details: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (messages && messages.length > 0) {
      details[field] = messages as string[];
    }
  }

  if (flat.formErrors.length > 0) {
    details['_root'] = flat.formErrors;
  }

  return details;
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError('Validation failed', buildDetails(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError('Validation failed', buildDetails(result.error)));
      return;
    }
    req.query = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new ValidationError('Validation failed', buildDetails(result.error)));
      return;
    }
    req.params = result.data;
    next();
  };
}
