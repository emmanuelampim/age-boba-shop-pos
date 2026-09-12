// Browser-side plumbing for the customer display.
//
// The cashier window is the ONLY publisher: it broadcasts full snapshots
// of the existing cart (one source of truth) over a BroadcastChannel.
// The /customer window simply renders what it receives. The customer
// window never calls the API, so it is display-only and secure.
import {
  CHANNEL_NAME,
  WINDOW_NAME,
  CUSTOMER_PATH,
  buildCartSnapshot,
  buildThankYouSnapshot,
  buildIdleSnapshot,
  buildStandbySnapshot,
} from './customerDisplayCore.js';

const REOPEN_CHECK_MS = 4000;
const DETECT_DELAY_MS = 500;

let channel = null;
let windowRef = null;
let settings = {};
let cart = { items: [], subtotal: 0, discount: 0, total: 0 };
let methodName = null;
let enabled = true;
let connected = false;
let secondMonitorAvailable = null; // null = unknown, true/false = resolved
let lastThankYou = null;
let checkTimer = null;

function ttlMs() {
  return Number.parseInt(String(settings.customer_thank_you_seconds), 10) || 8;
}

export function isSupported() {
  return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';
}

function getChannel() {
  if (!isSupported()) return null;
  if (channel) return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const msg = event?.data || {};
    // A (re)loaded customer window asks for the current state so it
    // never sits on stale content.
    if (msg.type === 'hello') publish();
  };
  return channel;
}

export function setSettings(next) {
  settings = { ...settings, ...(next || {}) };
}

export function setCart(next) {
  cart = next || { items: [], subtotal: 0, discount: 0, total: 0 };
}

export function setMethodName(name) {
  methodName = name || null;
  publish();
}

export function connect(opts = {}) {
  connected = true;
  setSettings(opts.settings);
  setCart(opts.cart);
  getChannel();
}

export function publish() {
  if (!connected || !enabled) return;
  const ch = getChannel();
  if (!ch) return;

  // Re-broadcast a running thank-you (so a freshly loaded customer window
  // or a reconnect shows it instead of an empty idle screen).
  if (lastThankYou && Date.now() - lastThankYou.at < ttlMs() * 1000) {
    ch.postMessage(buildThankYouSnapshot(settings, lastThankYou.method, lastThankYou.total));
    return;
  }

  if (cart.items.length > 0) {
    ch.postMessage(buildCartSnapshot(settings, cart, methodName));
  } else {
    ch.postMessage(buildIdleSnapshot(settings));
  }
}

export function showThankYou(method, total) {
  if (!connected || !enabled) return;
  lastThankYou = { method, total, at: Date.now() };
  const ch = getChannel();
  if (ch) ch.postMessage(buildThankYouSnapshot(settings, method, total));
}

function postStandby() {
  const ch = getChannel();
  if (ch) ch.postMessage(buildStandbySnapshot());
  lastThankYou = null;
}

function windowNameUrl() {
  try {
    return new URL(CUSTOMER_PATH, window.location.href).href;
  } catch {
    return CUSTOMER_PATH;
  }
}

function openWindow() {
  try {
    // Reuse a window we already own (no duplicates).
    const existing = window.open('', WINDOW_NAME);
    if (existing && !existing.closed) {
      windowRef = existing;
      return existing;
    }
  } catch {
    /* name lookup not allowed/relevant */
  }
  try {
    const win = window.open(
      windowNameUrl(),
      WINDOW_NAME,
      'width=1280,height=800,popup=yes,location=no,menubar=no,toolbar=no,status=no',
    );
    windowRef = win;
    return win;
  } catch {
    windowRef = null;
    return null;
  }
}

function positionOnSecondMonitor(win) {
  try {
    // Place the window exactly at the right edge of the primary monitor.
    // With monitors arranged side-by-side (common setup) this lands the
    // customer display on Display 2. Best-effort: browsers cannot read
    // the full monitor layout, so this is a practical heuristic.
    const aw = window.screen.availWidth;
    const ah = window.screen.availHeight;
    win.moveTo(aw, 0);
    win.resizeTo(Math.max(800, window.screen.width - aw), ah);
    return true;
  } catch {
    return false;
  }
}

function detectSecondMonitor() {
  try {
    if (!windowRef || windowRef.closed) return false;
    // After moveTo(), a real second monitor keeps the window at x >= the
    // primary screen's width; a single monitor clamps it back to x=0.
    return windowRef.screenX >= window.screen.availWidth;
  } catch {
    return false;
  }
}

function closeOwnedWindow() {
  if (windowRef && !windowRef.closed) {
    try {
      windowRef.close();
    } catch {
      /* window not closeable (e.g. kiosk) - the disable broadcast covers it */
    }
  }
  windowRef = null;
}

function stopReopenCheck() {
  if (checkTimer) {
    window.clearInterval(checkTimer);
    checkTimer = null;
  }
}

function scheduleReopenCheck() {
  stopReopenCheck();
  if (!enabled || !connected) return;
  checkTimer = window.setInterval(() => {
    if (!connected || !enabled) return;
    if (secondMonitorAvailable === false) return;
    if (!windowRef || windowRef.closed) ensureOpen();
  }, REOPEN_CHECK_MS);
}

export function ensureOpen({ force = false } = {}) {
  if (!isSupported() || !connected) return null;
  if (!enabled && !force) return null;

  const win = openWindow();
  if (!win) return null;

  const wasPositioned = positionOnSecondMonitor(win);

  if (force) {
    // Manual "Open test display" - keep it open no matter what.
    secondMonitorAvailable = true;
    scheduleReopenCheck();
    // Regain cashier focus after opening the popup.
    window.setTimeout(() => window.focus(), 300);
    return win;
  }

  window.setTimeout(() => {
    if (!windowRef || windowRef.closed) return;
    const onSecond = wasPositioned && detectSecondMonitor();
    if (onSecond) {
      secondMonitorAvailable = true;
      scheduleReopenCheck();
      window.focus();
    } else {
      // No second display - keep the POS running untouched and simply
      // don't show a customer screen.
      secondMonitorAvailable = false;
      closeOwnedWindow();
    }
  }, DETECT_DELAY_MS);

  return win;
}

// Force-close any display we own, wake from other windows (kiosk) by
// sending a disable message. Used on logout / when the setting is off.
export function setEnabled(next) {
  enabled = !!next;
  if (!enabled) {
    postStandby();
    stopReopenCheck();
    closeOwnedWindow();
    return;
  }
  if (connected) ensureOpen();
}

export function disconnect() {
  connected = false;
  postStandby();
  stopReopenCheck();
  closeOwnedWindow();
  if (channel) {
    try {
      channel.close();
    } catch {
      /* noop */
    }
    channel = null;
  }
}