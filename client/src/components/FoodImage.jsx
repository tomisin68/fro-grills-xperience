import { Beef, CookingPot, CupSoda, Drumstick, Fish, Flame, Salad, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { cx } from './ui';

// Dishes without a photo get warm, consistent artwork instead of a broken image.
const ART = [
  [/fish|croaker|catfish|tilapia/i, Fish, 'from-sky-900 via-coal-900 to-coal-950'],
  [/drink|zobo|juice|chapman|coke|cola|malt|water|soda|smoothie/i, CupSoda, 'from-rose-700 via-rose-900 to-coal-950'],
  [/chicken|wing|turkey/i, Drumstick, 'from-ember-600 via-ember-800 to-coal-950'],
  [/suya|beef|asun|goat|meat/i, Beef, 'from-red-700 via-red-900 to-coal-950'],
  [/platter|box|combo/i, UtensilsCrossed, 'from-amber-600 via-ember-800 to-coal-950'],
  [/rice|jollof|spaghetti|pasta|ofada|main/i, CookingPot, 'from-orange-600 via-orange-800 to-coal-950'],
  [/side|plantain|dodo|fries|chips|slaw|salad|boli|yam/i, Salad, 'from-lime-700 via-emerald-900 to-coal-950'],
];

export function FoodImage({ src, name = '', category = '', className, iconClassName, rounded = 'rounded-2xl' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cx('size-full object-cover', rounded, className)}
      />
    );
  }
  const [, Icon, gradient] = ART.find(([re]) => re.test(name) || re.test(category)) ?? [null, Flame, 'from-ember-500 via-ember-800 to-coal-950'];
  return (
    <div
      role="img"
      aria-label={name}
      className={cx('relative grid size-full place-items-center overflow-hidden bg-linear-to-br', gradient, rounded, className)}
    >
      <div className="grain absolute inset-0 opacity-60" />
      <div className="absolute -right-6 -bottom-8 size-2/3 rounded-full bg-ember-400/20 blur-2xl" />
      <Icon className={cx('relative size-1/3 max-h-16 max-w-16 text-white/85 drop-shadow', iconClassName)} strokeWidth={1.5} />
    </div>
  );
}
