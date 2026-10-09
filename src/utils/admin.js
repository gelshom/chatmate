import { config } from '../config.js';

export function isBootstrapAdmin(user) {
  return Boolean(user && config.adminEmail && String(user.email || '').trim().toLowerCase() === config.adminEmail);
}

export function isAdminUser(user) {
  return Boolean(user && (user.role === 'admin' || isBootstrapAdmin(user)));
}
