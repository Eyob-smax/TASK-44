import { get, post } from './api-client.js';
import type { AuthSessionResponse, UserResponse } from './types.js';

export const authService = {
  async login(username: string, password: string): Promise<AuthSessionResponse> {
    return post<AuthSessionResponse>('/auth/login', { username, password });
  },

  async logout(): Promise<void> {
    await post('/auth/logout');
  },

  async me(): Promise<{ user: UserResponse; permissions: string[] }> {
    return get('/auth/me');
  },
};
