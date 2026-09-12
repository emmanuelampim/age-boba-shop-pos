import { formatDateTime } from './date'

const W = 48
const RIGHT_COL = 13

function padRight(s, n) {
  return (s + ' '.repeat(n)).slice(0, n)
}
function padLeft(s, n) {
  return (' '.repeat(n) + s).slice(-n)
}
function center(s, n) {
  if (s.length >= n) return s
  return ' '.repeat(Math.floor((n - s.length) / 2)) + s
}
function divider() {
  return '-'.repeat(W)
}
function moneyLine(label, cents, symbol) {
  const neg = Number(cents) < 0
  const amount = `${neg ? '-' : ''}${symbol}${(Math.abs(Number(cents)) / 100).toFixed(2)}`
  return padRight(label, W - RIGHT_COL) + padLeft(amount, RIGHT_COL)
}
function fieldLine(label, value) {
  return padRight(label, 16) + String(value ?? '')
}

export function buildReceiptText(order, settings) {
  const symbol = settings.currency_symbol || 'GH₵'
  const money = (n) => {
    const neg = Number(n) < 0
    return `${neg ? '-' : ''}${symbol}${(Math.abs(Number(n)) / 100).toFixed(2)}`
  }
  const lines = []

  if (settings.shop_name) lines.push(center(settings.shop_name, W))
  if (settings.receipt_show_address && settings.shop_address) {
    lines.push(center(settings.shop_address, W))
  }
  if (settings.receipt_show_phone && settings.shop_phone) {
    lines.push(center(settings.shop_phone, W))
  }

  lines.push(divider())
  lines.push(fieldLine('Receipt', order.order_number_display || (order.order_number != null ? `#${String(order.order_number).padStart(6, '0')}` : '—')))
  if (order.created_at) lines.push(fieldLine('Date', formatDateTime(order.created_at)))
  lines.push(divider())

  for (const item of order.items || []) {
    const name = `${item.quantity}x ${item.product_name}`
    lines.push(padRight(name, W - RIGHT_COL) + padLeft(money(item.total_price), RIGHT_COL))
    if (item.size_name) lines.push(`   ${item.size_name}`)
    for (const t of item.toppings || []) {
      lines.push(`   + ${t.topping_name || t.name}`)
    }
    if (item.unit_price != null) lines.push(`   @${money(item.unit_price)} / each`)
  }

  lines.push(divider())
  lines.push(moneyLine('Subtotal', order.subtotal, symbol))
  if (order.discount > 0) lines.push(moneyLine('Discount', -order.discount, symbol))
  lines.push(moneyLine('Total', order.total, symbol))
  lines.push(fieldLine('Payment', order.payment_method || '—'))
  if (order.customer_phone) lines.push(fieldLine('Customer phone', order.customer_phone))
  if (order.payment_ref) lines.push(fieldLine('MoMo Ref', order.payment_ref))
  if (order.momo_status) lines.push(fieldLine('Status', 'Manually Confirmed'))
  if (order.user?.name) lines.push(fieldLine('Served by', order.user.name))

  if (settings.receipt_footer) {
    lines.push(divider())
    lines.push('')
    lines.push(center(settings.receipt_footer, W))
  }

  lines.push('')
  lines.push('')
  lines.push('')
  lines.push('')

  return lines.join('\r\n')
}