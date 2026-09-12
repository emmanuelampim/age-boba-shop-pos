import { createContext, useContext, useReducer, useMemo } from 'react'

const CartContext = createContext(null)

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.id === action.item.id)
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === action.item.id ? { ...i, quantity: i.quantity + action.item.quantity } : i
          ),
        }
      }
      return { ...state, items: [...state.items, action.item] }
    }
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, quantity: Math.min(999, Math.max(1, action.quantity)) } : i
        ),
      }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) }
    case 'SET_DISCOUNT':
      return { ...state, discount: Math.max(0, Math.round(Number(action.cents) || 0)) }
    case 'CLEAR':
      return { items: [], discount: 0 }
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], discount: 0 })

  const subtotal = useMemo(
    () => state.items.reduce((sum, item) => sum + (item.unitPrice + item.toppingUnitTotal) * item.quantity, 0),
    [state.items]
  )

  const itemCount = useMemo(
    () => state.items.reduce((sum, item) => sum + item.quantity, 0),
    [state.items]
  )

  const total = useMemo(() => Math.max(0, subtotal - state.discount), [subtotal, state.discount])

  return (
    <CartContext.Provider
      value={{ items: state.items, subtotal, discount: state.discount, total, itemCount, dispatch }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
