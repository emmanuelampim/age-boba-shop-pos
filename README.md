# Boba Shop POS

Production-grade MVP Point of Sale system for a boba shop (Accra, GH).

- **Backend**: Node.js 12.22+ (runs on Windows 7), Express, JSON (REST) API, cookie-based JWT auth, role-based authorization.
- **Frontend**: React + Vite, vanilla CSS design system, no heavy state libraries.
- **Database**: SQLite via **sql.js** (pure-JS/WASM engine — zero native modules, so the whole backend ships as one self-contained file for old/offline machines).

> Money is stored as **integers in the smallest currency unit (GH₵ × 100 = pesewas)**. Never use floats for money.

---

## Architecture

```
Frontend (React)
   │  REST JSON (never client-computed prices/totals)
   ▼
API layer (Express routes, validation, auth/roles)
   ▼
Service layer (orderService, inventoryService, productService)
   ▼
SQLite (single connection, WAL, transactional writes)
```

- The server is the **only** authority for prices, totals, stock, and permissions.
- A sale = order + order items + topping selections + payment record + inventory deduction, all inside **one SQL transaction**.
- Order creation is **idempotent**: the client sends a `requestId` (UUID); a duplicate returns the original order instead of creating a second sale.
- The backend also serves the built frontend (`frontend/dist`), so production is **one Node process**.

---

## Quick start (development)

Requires Node.js 12.22+ (sql.js is pure JS/WASM — no native modules; development is comfortable on current Node).

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env            # edit DB_PATH, JWT_SECRET, APP_PORT
npm run migrate                 # apply schema migrations
npm run seed                    # seed owner user + catalog + inventory + settings
npm start                       # auto-migrates + auto-seeds empty DBs, serves API + built frontend on http://localhost:4000

# 2. Frontend (in another terminal)
cd frontend
npm install
cp .env.example .env            # VITE_API_URL=http://localhost:4000/api
npm run dev                     # app on http://localhost:5173 (dev only)
```

Seed login: **mavisampim@gmail.com / Owner@123** (change immediately in Settings → Users).

Health check: `GET http://localhost:4000/api/health`

---

## Environment variables

### Backend (`backend/.env`)

| Variable      | Description                                             | Default                      |
| ------------- | ------------------------------------------------------- | ---------------------------- |
| `APP_PORT`    | HTTP port                                               | `4000`                       |
| `DB_PATH`     | SQLite file path (e.g. `./data/pos.db`)                 | `./data/pos.db`              |
| `JWT_SECRET`  | HMAC secret for signing auth tokens (required in prod)  | `dev-secret-change-me`       |
| `JWT_TTL`     | Token lifetime seconds                                  | `86400` (24h)                |
| `TRUST_PROXY` | Set `true` behind a reverse proxy (for rate limiting)   | `false`                      |

`.env.example` is committed. Real `.env` is git-ignored — **never commit secrets**.

### Frontend (`frontend/.env`)

| Variable         | Description             | Default                |
| ---------------- | ----------------------- | ---------------------- |
| `VITE_API_URL`   | Backend API base URL    | `http://localhost:4000/api` |

---

## Database

- Location: `backend/data/pos.db` (see `DB_PATH`). Single file; written atomically (temp file + rename) after every committed write, so a running copy is always a valid, recently-committed snapshot.
- Migrations: `backend/db/migrations/*.js` applied in order by `npm run migrate` (also auto-applied at server start). Each runs in a transaction and is recorded in `schema_migrations`.
- Backup: see [Backup strategy](#backup-strategy).

### Schema (summary)

- `users` — email, scrypt password hash, role (`OWNER | MANAGER | CASHIER | INVENTORY_MANAGER`), status.
- `branches` — shop locations.
- `categories`, `products` — menu products (`ACTIVE/INACTIVE`, soft delete).
- `product_sizes` — per-product sizes with own price + optional linked cup inventory item.
- `toppings`, `product_toppings` — toppings with price, linked to inventory, per-product availability.
- `orders` — snapshots of totals, payment, status (`COMPLETED/CANCELLED/REFUNDED`), unique `requestId` for idempotency, sequence-based `order_number`.
- `order_items`, `order_item_toppings` — name + price **snapshots** at time of sale.
- `order_status_histories` — who cancelled/refunded, when, reason.
- `inventory_items`, `inventory_transactions` — full stock ledger (every change logged: delta, prev/new qty, reason, user).
- `payment_methods` — configurable payment options.
- `settings` — shop info + receipt config + currency.
- `audit_logs` — admin actions (price change, disable product, adjust stock, refund, settings change…).

### Manual migration add

```bash
# create backend/db/migrations/00N_name.js exporting up(db) { db.exec(`...`); }
npm run migrate
```

---

## API

Base URL `/api`. All endpoints except `/health`, `/auth/login` require the session cookie.

Common response shapes:

```jsonc
// success (single resource)
{ "success": true, "data": { ... } }
// success (list)
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 } }
// error
{ "success": false, "error": { "code": "ORDER_NOT_FOUND", "message": "..." } }
```

| Method | Path                          | Role        | Description                              |
| ------ | ----------------------------- | ----------- | ---------------------------------------- |
| POST   | `/api/auth/login`             | public      | Login, sets cookie                       |
| POST   | `/api/auth/logout`            | auth        | Clear session                            |
| GET    | `/api/auth/me`                | auth        | Current user                             |
| GET    | `/api/products`               | auth        | List products (with sizes/toppings)      |
| POST   | `/api/products`               | OWNER/MGR   | Create product                           |
| PATCH  | `/api/products/:id`           | OWNER/MGR   | Update product, sizes, toppings          |
| POST   | `/api/products/:id/toggle`    | OWNER/MGR   | Activate/deactivate product              |
| GET    | `/api/toppings`               | auth        | List toppings                            |
| POST   | `/api/toppings`               | OWNER/MGR   | Create topping                           |
| PATCH  | `/api/toppings/:id`           | OWNER/MGR   | Update topping                           |
| POST   | `/api/toppings/:id/toggle`    | OWNER/MGR   | Activate/deactivate topping              |
| GET    | `/api/categories`             | auth        | List categories                          |
| POST   | `/api/orders`                 | auth        | Create order (atomic, idempotent)        |
| GET    | `/api/orders`                 | auth        | List orders (filters + pagination)       |
| GET    | `/api/orders/:id`             | auth        | Order detail (receipt data)              |
| POST   | `/api/orders/:id/cancel`      | OWNER/MGR   | Cancel order (restores stock)            |
| POST   | `/api/orders/:id/refund`      | OWNER/MGR   | Refund order (restores stock, status log)|
| GET    | `/api/inventory`              | auth        | Inventory items                          |
| POST   | `/api/inventory/adjust`       | OWNER/MGR/INV | Adjust/restock/waste stock             |
| GET    | `/api/inventory/transactions` | auth        | Inventory ledger (paginated)             |
| GET    | `/api/dashboard/summary`      | auth        | Today's sales, best sellers, low stock    |
| GET    | `/api/settings`               | auth        | Shop + receipt settings                  |
| PATCH  | `/api/settings`               | OWNER       | Update settings + receipt config         |
| GET    | `/api/settings/payment-methods`| auth       | Active payment methods                   |
| POST   | `/api/settings/payment-methods`| OWNER     | Add payment method                       |
| PATCH  | `/api/settings/payment-methods/:id` | OWNER | Toggle payment method                   |
| PATCH  | `/api/users/:id`              | OWNER       | Update user (role/status/password)       |
| GET    | `/api/users`                  | OWNER       | List users                               |
| POST   | `/api/shutdown`               | auth        | Save everything, stop the server (POS only, disabled in tests) |
| GET    | `/health`                     | public      | App + DB health check                    |

### Order creation example

```jsonc
// POST /api/orders
{
  "requestId": "2f5d6d9f-...",          // client UUID — guards against double-submit
  "branchId": 1,
  "paymentMethodId": 1,
  "discount": 350,                       // GH₵3.50 in pesewas (server-validated, not trusted blindly)
  "notes": "",
  "items": [
    { "productId": 1, "sizeId": 3, "quantity": 2,
      "toppingIds": [1, 2] }
  ]
}
```

The server looks up **current** prices, validates availability/stock, computes subtotal/discount/total, snapshots names+prices, deducts inventory, generates `#000…` order number, and commits atomically. Duplicate `requestId` → returns the original order with `"duplicate": true` (HTTP 200), never a second sale.

### Inventory adjust example

```jsonc
// POST /api/inventory/adjust
{
  "itemId": 4,
  "type": "ADJUSTMENT",        // RESTOCK | ADJUSTMENT | WASTE
  "quantity": 50,              // signed; RESTOCK typically positive
  "note": "Delivery from supplier"
}
```

---

## Testing

Backend tests use Node's built-in `node:test` runner + `supertest`, against an isolated in-memory test database.

```bash
cd backend
npm test
```

Covers: money/tax-free totals, inventory deduction, order numbering sequence, permission middleware, idempotent order creation, insufficient stock, disabled product, invalid/negative qty, invalid discount, login, unauthorized requests, inventory adjust + ledger, full sale integration (checkout → DB → inventory → receipt payload).

Frontend: `npm run build` (runs Vite production build) and `npm run lint`.

---

## Backup strategy

- **What**: the SQLite file `backend/data/pos.db`. It is written via atomic replace, so the **database is a single file** — no `-wal`/`-shm` siblings.
- **How often**: end of every day (or hourly). `cp pos.db backups/pos-$(date +%F).db` (with sql.js the file is consistent even if copied mid-run — it reflects the last committed write; stopping the server first gives the freshest copy).
- **Where**: copy snapshots to the same host, then off-site (cloud object storage / NAS / USB for the Windows 7 box). Keep daily for 30 days, monthly for 12 months.
- **Restore**: stop the app, `cp` the backup over `pos.db`, start the app, verify `GET /api/health` and recent order counts.
- **Manual integrity check**: `sqlite3 pos.db "PRAGMA integrity_check;"` before restoring.

---

## Deployment

Production = Node process serving the built frontend plus the API.

```bash
# 1. Backend
cd backend && npm ci
cp .env.example .env      # set real JWT_SECRET, DB_PATH, APP_PORT, TRUST_PROXY=true
npm run migrate && npm run seed
node src/index.js          # or use pm2 / systemd / docker

# 2. Frontend
cd frontend && npm ci && npm run build
# serve frontend/dist with any static server (nginx, etc.) or from the backend

# 3. Proxy (recommended)
# nginx: /api/*  -> backend APP_PORT
#         /*     -> frontend/dist (SPA fallback to index.html)

# 4. Verify
curl http://localhost:4000/api/health
```

Run behind HTTPS (reverse proxy terminates TLS). The session cookie is `SameSite=Lax` + `HttpOnly`; set `Secure` in production via `COOKIE_SECURE=true`.

### Deployment on Windows 7 (offline POS box, autostart on boot)

The POS also runs fully offline on the shop's Windows 7 machine — it was designed for exactly that. Node ≥14 dropped Windows 7, so the backend is bundled with esbuild into **one self-contained CommonJS file** targeted at Node 12.22 (also runtime-compatible with any newer Node).

```bash
# 1. Build the Windows bundle (run anywhere; output is OS-independent)
cd backend && npm run build:win
#    produces: backend/dist/server.cjs + backend/dist/sql-wasm.wasm

# 2. Copy the repo to the Win7 machine, e.g. C:\boba-pos, then follow
#    windows\README.WINDOWS7.txt
```

On the Win7 box (see `windows/`):

- **Node.js 12.22.12** (last Node with Windows 7 support) — required once at setup.
- **Chrome 109** (last Chrome for Windows 7) or Firefox ESR for the cashier screen.
- zero-install at runtime: `start_pos.cmd` launches `backend/dist/server.cjs`; the first run auto-migrates + auto-seeds the DB; the server serves the built frontend from `frontend/dist` — **one process, no internet needed**.
- **Autostart**: `windows\install_autostart.cmd` registers the POS **three independent ways** (Startup-folder VBS, Registry `Run` key, and a Task Scheduler "at logon" task) so it starts on every boot even if one method is disabled by antivirus or a mistake. Every boot, the POS server starts hidden and the browser opens at `http://localhost:4000` with no clicks. Remove with `windows\remove_autostart.cmd`.
- **Close for the day**: every logged-in user sees a **"🔒 Close for the day"** button in the sidebar. It force-flushes the database to disk, returns a friendly "All sales are saved — you can switch off the computer" screen, then stops the server. No command lines needed for untrained staff. (`POST /api/shutdown`; disabled in the test environment.)
- `windows\stop_pos.cmd` shuts it down; `backend\data\pos.db` is the shop's entire data file (back it up daily).

### Logging

Structured stdout logs on `backend/src/lib/logger.js`. Debug level via `LOG_LEVEL=debug`. Errors are logged server-side only; API responses never expose stack traces or SQL.

---

## Roles

| Role                | Can                                                              |
| ------------------- | ---------------------------------------------------------------- |
| `OWNER`             | Everything                                                       |
| `MANAGER`           | Sales, products, inventory, refunds (no user management)         |
| `CASHIER`           | New sale, sales history                                          |
| `INVENTORY_MANAGER` | Inventory views + adjustments (no sales/pricing)                 |

Permissions are enforced **server-side** (middleware), never by hiding buttons alone.

---

## Landmine notes / known limitations

- Offline mode is **not** implemented. The POS needs connectivity; a failed `Complete Sale` returns an explicit error and no order is written. `requestId` prevents double-submit.
- Receipt printing targets browser print (CSS `@media print`, 80 mm width). No raw ESC/POS thermal protocol yet.
- Money is integer pesewas. Discounts are flat amounts per order (no percentage) in v1.
- Inventory is single-location (no per-branch stock). Branch is recorded on orders for future multi-branch work.
- No photo upload for products yet (name/description only).
- No built-in payment gateway integration (payment method is recorded only).