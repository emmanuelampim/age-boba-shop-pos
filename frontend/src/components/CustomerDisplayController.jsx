import { useEffect, useRef } from 'react';
import { useCart } from '../store/cart';
import * as customerDisplay from '../lib/customerDisplay';

// Bridges the cashier window's React cart state and server settings to the
// BroadcastChannel-based customer display module.
export default function CustomerDisplayController({ settings }) {
  const { items, subtotal, discount, total } = useCart();
  const prevSettingsRef = useRef(settings);

  useEffect(() => {
    customerDisplay.connect({ settings, cart: { items, subtotal, discount, total } });
    customerDisplay.setEnabled(settings?.customer_display_enabled !== false);
    customerDisplay.ensureOpen();
    return () => {
      customerDisplay.disconnect();
    };
  }, []);

  // Re-connect when settings change (e.g. owner saves Settings > Display).
  useEffect(() => {
    if (prevSettingsRef.current !== settings) {
      prevSettingsRef.current = settings;
      customerDisplay.setSettings(settings);
      customerDisplay.setEnabled(settings?.customer_display_enabled !== false);
    }
  }, [settings]);

  // Publish live cart whenever it changes.
  useEffect(() => {
    customerDisplay.setCart({ items, subtotal, discount, total });
    customerDisplay.publish();
  }, [items, subtotal, discount, total]);

  return null;
}