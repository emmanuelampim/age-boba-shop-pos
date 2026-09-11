import { badRequest } from '../lib/http.js';

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const errors = schema(req[source] ?? {});
    if (errors) return next(badRequest('VALIDATION_ERROR', errors));
    next();
  };
}

// Small composable validators. Each returns an error string or null.
const isInt = (v) => Number.isInteger(v);
const isString = (v) => typeof v === 'string';
const isBool = (v) => typeof v === 'boolean';

export const v = {
  requiredString(field, value, { max = 255 } = {}) {
    if (!isString(value) || value.trim() === '') return `${field} is required.`;
    if (value.trim().length > max) return `${field} must be ${max} characters or fewer.`;
    return null;
  },
  optionalString(field, value, { max = 255 } = {}) {
    if (value === undefined || value === null) return null;
    return v.requiredString(field, value, { max });
  },
  integer(field, value, { min, max } = {}) {
    if (!isInt(value)) return `${field} must be an integer.`;
    if (min !== undefined && value < min) return `${field} must be at least ${min}.`;
    if (max !== undefined && value > max) return `${field} must be at most ${max}.`;
    return null;
  },
  boolean(field, value) {
    if (!isBool(value)) return `${field} must be a boolean.`;
    return null;
  },
  email(field, value) {
    if (!isString(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return `${field} must be a valid email.`;
    }
    return null;
  },
  enum(field, value, allowed) {
    if (!allowed.includes(value)) return `${field} must be one of: ${allowed.join(', ')}.`;
    return null;
  },
  positiveInteger(field, value) {
    return v.integer(field, value, { min: 1 });
  },
  nonNegativeInteger(field, value) {
    return v.integer(field, value, { min: 0 });
  },
};

export function collect(errs) {
  const list = errs.filter((e) => e);
  return list.length ? list.join(' ') : null;
}

export function validateProductSchema(input) {
  const errs = [];
  errs.push(v.requiredString('name', input.name));
  errs.push(v.optionalString('description', input.description, { max: 2000 }));
  errs.push(v.optionalString('imageUrl', input.imageUrl, { max: 500 }));
  errs.push(v.optionalString('categoryId', input.categoryId));
  errs.push(v.nonNegativeInteger('price', input.price));
  if (Array.isArray(input.sizes)) return collect(errs);
  return collect(errs);
}