import * as repo from './repository.js';
import type { UpdateConfigRequest } from './types.js';

export function getConfig() {
  return repo.getConfig();
}

export function updateConfig(updates: UpdateConfigRequest) {
  return repo.applyConfigUpdate(updates);
}
