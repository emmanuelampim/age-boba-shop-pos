import { buildReceiptLines } from '../lib/receipt'
import { formatCents } from '../lib/money'

export default function ReceiptView({ order, settings }) {
  const r = buildReceiptLines(order, settings)
  const c = (n) => formatCents(n, r.currencySymbol)

  return (
    <div className="receipt" aria-label="Receipt">
      <img className="receipt-watermark" src="/logo.png" alt="" aria-hidden="true" />
      <div className="receipt-header">
        <h2>{r.shopName || 'AGE BOBA SHOP'}</h2>
        {r.showAddress && r.shopAddress && <p>{r.shopAddress}</p>}
        {r.showPhone && r.shopPhone && <p>{r.shopPhone}</p>}
        {r.shopEmail && <p>{r.shopEmail}</p>}
      </div>

      <hr className="receipt-divider" />
      <div className="receipt-line">
        <span>Receipt</span>
        <span className="num">{r.orderNumber}</span>
      </div>
      {r.dateTime && (
        <div className="receipt-line">
          <span>Date</span>
          <span className="num">{r.dateTime}</span>
        </div>
      )}
      <hr className="receipt-divider" />

      {r.items.map((it, idx) => (
        <div className="receipt-item" key={idx}>
          <div className="receipt-line">
            <span className="text">
              {it.quantity}× {it.name}
            </span>
            <span className="num">{c(it.lineTotal)}</span>
          </div>
          {it.sizeName && <div className="receipt-sub">{it.sizeName}</div>}
          {it.toppings?.map((t, ti) => (
            <div className="receipt-sub" key={ti}>
              + {t}
            </div>
          ))}
          <div className="receipt-sub">@{c(it.unitPrice)} / each</div>
        </div>
      ))}

      <hr className="receipt-divider" />
      <div className="receipt-line">
        <span>Subtotal</span>
        <span className="num">{c(r.subtotal)}</span>
      </div>
      {r.discount > 0 && (
        <div className="receipt-line">
          <span>Discount</span>
          <span className="num">-{c(r.discount)}</span>
        </div>
      )}
      <div className="receipt-line receipt-total">
        <span>Total</span>
        <span className="num">{c(r.total)}</span>
      </div>
      <div className="receipt-line">
        <span>Payment</span>
        <span className="num">{r.paymentMethod}</span>
      </div>
      {r.customerPhone && (
        <div className="receipt-line">
          <span>Customer phone</span>
          <span className="num">{r.customerPhone}</span>
        </div>
      )}
      {r.paymentRef && (
        <div className="receipt-line">
          <span>MoMo Ref</span>
          <span className="num">{r.paymentRef}</span>
        </div>
      )}
      {r.momoStatus && (
        <div className="receipt-line">
          <span>Status</span>
          <span className="num">Manually Confirmed</span>
        </div>
      )}
      {r.servedBy && (
        <div className="receipt-line">
          <span>Served by</span>
          <span className="num">{r.servedBy}</span>
        </div>
      )}
      {r.footer && (
        <>
          <hr className="receipt-divider" />
          <div className="receipt-footer">{r.footer}</div>
        </>
      )}
    </div>
  )
}