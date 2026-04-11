declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      username: string;
      roles: string[];
      permissions: string[];
      orgId?: string;
    };
    requestId: string;
    idempotencyKey?: string;
  }
}
