import { Router } from 'express';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  toggleProduct,
  listCategories,
  createCategory,
} from '../services/productService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendError, ok, badRequest } from '../lib/http.js';

function validateProductInput(input) {
  const errs = [];
  if (typeof input.name !== 'string' || !input.name.trim()) errs.push('name is required.');
  if (input.price !== undefined && (!Number.isInteger(input.price) || input.price < 0)) {
    errs.push('price must be a non-negative integer (in pesewas).');
  }
  if (input.sizes !== undefined && !Array.isArray(input.sizes)) errs.push('sizes must be an array.');
  if (input.toppingIds !== undefined && !Array.isArray(input.toppingIds)) errs.push('toppingIds must be an array.');
  if (input.sizes) {
    for (const s of input.sizes) {
      if (typeof s.name !== 'string' || !s.name.trim()) errs.push('Each size needs a name.');
      if (!Number.isInteger(s.price) || s.price < 0) errs.push(`Size "${s.name}" needs a non-negative integer price.`);
    }
  }
  return errs.length ? errs.join(' ') : null;
}

export function createRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/', (req, res) => {
    try {
      const products = listProducts({ status: req.query.all === '1' ? undefined : 'ACTIVE' });
      return ok(res, products);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get('/categories', (req, res) => {
    try {
      return ok(res, listCategories());
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/categories', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const name = req.body?.name;
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name is required.'));
      }
      const cat = createCategory({ name, user: req.user });
      return ok(res, cat, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const product = getProduct(Number(req.params.id));
      if (!product) return sendError(res, err404());
      return ok(res, product);
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const input = req.body ?? {};
      const error = validateProductInput(input);
      if (error) return sendError(res, badRequest('VALIDATION_ERROR', error));
      const product = createProduct({
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        categoryId: input.categoryId,
        price: input.price !== undefined ? input.price : null,
        sizes: input.sizes,
        toppingIds: input.toppingIds,
        user: req.user,
      });
      return ok(res, product, 201);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return sendError(res, badRequest('VALIDATION_ERROR', 'Invalid product id.'));
      const patch = req.body ?? {};
      if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim())) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name must be a non-empty string.'));
      }
      if (patch.price !== undefined && (!Number.isInteger(patch.price) || patch.price < 0)) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'price must be a non-negative integer.'));
      }
      const product = updateProduct({ productId: id, patch, user: req.user });
      return ok(res, product);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/toggle', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const product = toggleProduct(id, req.user);
      return ok(res, product);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function err404() {
  return Object.assign(new Error('Product not found.'), { status: 404, code: 'PRODUCT_NOT_FOUND' });
}