import { ApiError } from './error.js';

export function validate(schema = {}) {
  return (req, res, next) => {
    for (const [section, fields] of Object.entries(schema)) {
      const values = req[section] || {};
      for (const [name, rules] of Object.entries(fields)) {
        const value = values[name];
        if (rules.required && (value == null || String(value).trim() === '')) {
          return next(new ApiError(400, `${name} is required.`));
        }
        if (value != null && rules.min && String(value).length < rules.min) {
          return next(new ApiError(400, `${name} must be at least ${rules.min} characters long.`));
        }
      }
    }
    next();
  };
}
