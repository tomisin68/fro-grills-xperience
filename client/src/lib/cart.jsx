import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocalStorage } from './hooks';

const CartContext = createContext(null);

const lineKey = (menuItemId, notes) => `${menuItemId}|${(notes || '').trim().toLowerCase()}`;

export function CartProvider({ children }) {
  const [lines, setLines] = useLocalStorage('fgx-cart', []);
  const [open, setOpen] = useState(false);

  const add = useCallback(
    (item, quantity = 1, notes = '') => {
      const key = lineKey(item.id, notes);
      setLines((prev) => {
        const existing = prev.find((l) => l.key === key);
        if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + quantity, 50) } : l));
        return [
          ...prev,
          {
            key,
            menuItemId: item.id,
            name: item.name,
            slug: item.slug,
            price: item.price,
            image_url: item.image_url,
            category: item.category_name ?? item.category,
            quantity,
            notes: notes.trim(),
          },
        ];
      });
    },
    [setLines],
  );

  const setQuantity = useCallback(
    (key, quantity) =>
      setLines((prev) =>
        quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(quantity, 50) } : l)),
      ),
    [setLines],
  );

  /** Drops lines for dishes no longer on the menu and refreshes prices from the latest menu. */
  const sync = useCallback(
    (menuItems) => {
      const byId = new Map(menuItems.map((i) => [i.id, i]));
      setLines((prev) =>
        prev
          .filter((l) => byId.has(l.menuItemId) && !byId.get(l.menuItemId).sold_out)
          .map((l) => ({ ...l, price: byId.get(l.menuItemId).price, name: byId.get(l.menuItemId).name })),
      );
    },
    [setLines],
  );

  const value = useMemo(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const subtotal = lines.reduce((s, l) => s + l.quantity * l.price, 0);
    const quantityOf = (menuItemId) => lines.filter((l) => l.menuItemId === menuItemId).reduce((s, l) => s + l.quantity, 0);
    return {
      lines,
      count,
      subtotal,
      quantityOf,
      add,
      setQuantity,
      sync,
      clear: () => setLines([]),
      open,
      setOpen,
    };
  }, [lines, add, setQuantity, sync, setLines, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
