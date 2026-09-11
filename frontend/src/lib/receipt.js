import { formatDateTime } from "./date";

export function buildReceiptLines(order, settings) {
  const currencySymbol = settings.currency_symbol || "GH₵";

  const orderNumber =
    order.order_number_display ||
    (order.order_number != null
      ? `#${String(order.order_number).padStart(6, "0")}`
      : "—");

  const items = (order.items || []).map((item) => ({
    name: item.product_name,
    sizeName: item.size_name,
    toppings: (item.toppings || []).map((t) => t.topping_name || t.name),
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.total_price,
  }));

  return {
    shopName: settings.shop_name,
    shopAddress: settings.shop_address,
    shopPhone: settings.shop_phone,
    shopEmail: settings.shop_email,
    logoUrl: settings.receipt_logo_url,
    showLogo: !!settings.receipt_show_logo,
    showAddress: !!settings.receipt_show_address,
    showPhone: !!settings.receipt_show_phone,
    orderNumber,
    dateTime: order.created_at ? formatDateTime(order.created_at) : null,
    items,
    subtotal: order.subtotal,
    discount: order.discount || 0,
    total: order.total,
    paymentMethod: order.payment_method || "—",
    footer: settings.receipt_footer,
    currencySymbol,
  };
}