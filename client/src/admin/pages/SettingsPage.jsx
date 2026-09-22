import { CircleAlert, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, cx, ErrorState, Input, PageLoader, Select, Switch, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { DAYS } from '../../lib/constants';
import { toMajor, toMinor } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { useToast } from '../../lib/toast';
import { MoneyInput, PageHeader } from '../components';
import ImageUpload from '../ImageUpload';

const SECTIONS = [
  ['restaurant', 'Restaurant'],
  ['hours', 'Opening hours'],
  ['ordering', 'Ordering & fees'],
  ['payments', 'Payments'],
  ['seo', 'Google & SEO'],
  ['locale', 'Currency & time'],
];

function Section({ title, description, children, onSave, busy }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {children}
      <div className="mt-6 flex justify-end border-t border-stone-100 pt-4">
        <Button loading={busy} onClick={onSave}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function RestaurantForm({ value, save, busy }) {
  const [f, setF] = useState({ ...value, cuisine: value.cuisine.join(', ') });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setSocial = (k) => (e) => setF({ ...f, social: { ...f.social, [k]: e.target.value } });
  return (
    <Section
      title="Restaurant profile"
      description="Shown on the website, receipts and in Google search results."
      busy={busy}
      onSave={() => save({ restaurant: { ...f, cuisine: f.cuisine.split(',').map((c) => c.trim()).filter(Boolean) } })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Restaurant name" value={f.name} onChange={set('name')} />
        <Input label="Tagline" value={f.tagline} onChange={set('tagline')} hint="The big headline on the home page." />
        <Textarea className="sm:col-span-2" label="About the restaurant" rows={3} value={f.description} onChange={set('description')} />
        <Input label="Phone" value={f.phone} onChange={set('phone')} />
        <Input label="WhatsApp number" value={f.whatsapp} onChange={set('whatsapp')} placeholder="2348012345678" hint="With country code, no + or spaces." />
        <Input label="Email" type="email" value={f.email} onChange={set('email')} />
        <Input label="Cuisine" value={f.cuisine} onChange={set('cuisine')} hint="Comma separated, e.g. Grill, Barbecue, Nigerian" />
        <Input className="sm:col-span-2" label="Street address" value={f.address} onChange={set('address')} />
        <Input label="City / area" value={f.city} onChange={set('city')} />
        <Input label="State" value={f.state} onChange={set('state')} />
        <Input label="Country code" value={f.country} maxLength={2} onChange={set('country')} hint="NG for Nigeria" />
        <Input label="Price range" value={f.priceRange} onChange={set('priceRange')} hint="₦, ₦₦ or ₦₦₦" />
        <Input
          className="sm:col-span-2"
          label="Google Maps embed link (optional)"
          value={f.mapEmbedUrl}
          onChange={set('mapEmbedUrl')}
          hint="In Google Maps: Share → Embed a map → copy only the link inside src=&quot;…&quot;"
        />
        <ImageUpload label="Logo" aspect="aspect-square max-w-40" value={f.logoUrl} onChange={(logoUrl) => setF({ ...f, logoUrl })} name={f.name} />
        <ImageUpload label="Home page photo" value={f.heroImageUrl} onChange={(heroImageUrl) => setF({ ...f, heroImageUrl })} name={f.name} />
        <Input label="Instagram link" value={f.social.instagram} onChange={setSocial('instagram')} placeholder="https://instagram.com/…" />
        <Input label="Facebook link" value={f.social.facebook} onChange={setSocial('facebook')} />
        <Input label="X (Twitter) link" value={f.social.x} onChange={setSocial('x')} />
        <Input label="TikTok link" value={f.social.tiktok} onChange={setSocial('tiktok')} />
      </div>
    </Section>
  );
}

function HoursForm({ value, save, busy }) {
  const [hours, setHours] = useState(value);
  const set = (day, patch) => setHours(hours.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => hours.find((h) => h.day === d));
  return (
    <Section title="Opening hours" description="Online ordering opens and closes automatically with these times. Closing after midnight (e.g. 18:00 – 02:00) is fine." busy={busy} onSave={() => save({ hours })}>
      <ul className="divide-y divide-stone-100">
        {ordered.map((h) => (
          <li key={h.day} className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-28 font-medium">{DAYS[h.day]}</span>
            <Switch checked={!h.closed} onChange={(open) => set(h.day, { closed: !open })} />
            {h.closed ? (
              <span className="text-sm text-stone-500">Closed</span>
            ) : (
              <span className="flex items-center gap-2">
                <input type="time" value={h.open} onChange={(e) => set(h.day, { open: e.target.value })} className="h-10 rounded-xl border-0 px-3 text-sm ring-1 ring-stone-300" />
                <span className="text-stone-400">to</span>
                <input type="time" value={h.close} onChange={(e) => set(h.day, { close: e.target.value })} className="h-10 rounded-xl border-0 px-3 text-sm ring-1 ring-stone-300" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function OrderingForm({ value, save, busy }) {
  const [f, setF] = useState({ ...value, deliveryFee: toMajor(value.deliveryFee), minOrder: toMajor(value.minOrder) });
  const toggle = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <Section
      title="Ordering & fees"
      busy={busy}
      onSave={() =>
        save({
          ordering: {
            ...f,
            deliveryFee: toMinor(f.deliveryFee),
            minOrder: toMinor(f.minOrder),
            taxRate: Number(f.taxRate) || 0,
            estimatedMinutes: Number(f.estimatedMinutes) || 30,
          },
        })
      }
    >
      <div className="space-y-4">
        <div className={cx('rounded-2xl p-4 ring-1', f.acceptingOrders ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200')}>
          <Switch checked={f.acceptingOrders} onChange={toggle('acceptingOrders')} label="Accept online orders" description="Turn off to pause the website during a rush or power outage. The menu stays visible." />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Switch checked={f.delivery} onChange={toggle('delivery')} label="Delivery" />
          <Switch checked={f.pickup} onChange={toggle('pickup')} label="Pickup" />
          <Switch checked={f.dineIn} onChange={toggle('dineIn')} label="Dine-in" />
        </div>
        <Switch
          checked={f.autoAccept}
          onChange={toggle('autoAccept')}
          label="Accept website orders automatically"
          description="Off: staff tap Accept on every new order (recommended). On: orders go straight to the kitchen."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Delivery fee" value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} />
          <MoneyInput label="Minimum online order" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} hint="0 for no minimum" />
          <Input label="Tax / VAT (%)" inputMode="decimal" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} hint="Added on top of menu prices. Use 0 if prices already include it." />
          <Input label="Usual wait (minutes)" type="number" value={f.estimatedMinutes} onChange={(e) => setF({ ...f, estimatedMinutes: e.target.value })} />
          <Input className="sm:col-span-2" label="Delivery note" value={f.deliveryNote} onChange={(e) => setF({ ...f, deliveryNote: e.target.value })} hint="Shown at checkout, e.g. the areas you deliver to." />
        </div>
      </div>
    </Section>
  );
}

function PaymentsForm({ value, paystack, save, busy }) {
  const [f, setF] = useState(value);
  return (
    <Section title="Payments" description="Choose how website customers can pay. Staff can always record cash, card and transfer at the counter." busy={busy} onSave={() => save({ payments: f })}>
      <div className="space-y-5">
        <Switch checked={f.cash} onChange={(cash) => setF({ ...f, cash })} label="Pay on delivery / at pickup" description="Cash or card when the food is handed over." />
        <div className="space-y-3">
          <Switch checked={f.transfer} onChange={(transfer) => setF({ ...f, transfer })} label="Bank transfer" description="Customers see these details after ordering." />
          {f.transfer && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Bank" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
              <Input label="Account name" value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} />
              <Input label="Account number" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Switch checked={f.online} onChange={(online) => setF({ ...f, online })} label="Pay online with Paystack" description="Card, bank transfer and USSD. Payments are confirmed automatically." />
          <p className={cx('flex items-start gap-2 rounded-xl p-3 text-sm ring-1', paystack ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200')}>
            {paystack ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {paystack
              ? 'Paystack is connected.'
              : 'Paystack is not connected yet, so online payment stays hidden. Add PAYSTACK_SECRET_KEY to the server settings to switch it on.'}
          </p>
        </div>
      </div>
    </Section>
  );
}

function SeoForm({ value, restaurant, save, busy }) {
  const [f, setF] = useState(value);
  const title = f.title || `${restaurant.name} | ${restaurant.tagline}`;
  const description = f.description || restaurant.description;
  return (
    <Section
      title="Google & SEO"
      description={`How ${restaurant.name} appears in Google search and when links are shared on WhatsApp or social media.`}
      busy={busy}
      onSave={() => save({ seo: f })}
    >
      <div className="space-y-4">
        <Input label="Search title" value={f.title} maxLength={70} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={`${restaurant.name} | ${restaurant.tagline}`} hint={`${title.length}/60 characters recommended`} />
        <Textarea label="Search description" value={f.description} maxLength={170} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={restaurant.description} hint={`${description.length}/160 characters recommended`} />
        <Input label="Keywords" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} hint="What people might search for, e.g. suya Lekki, grilled fish Lagos" />
        <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <p className="text-xs text-stone-500">Google preview</p>
          <p className="mt-2 text-sm text-stone-600">{window.location.host}</p>
          <p className="truncate text-lg text-[#1a0dab]">{title}</p>
          <p className="line-clamp-2 text-sm text-stone-600">{description}</p>
        </div>
        <p className="text-sm text-stone-500">
          Every dish gets its own page, and the menu, prices, hours and address are published in the format Google reads for restaurants. Submit{' '}
          <span className="font-mono text-xs">{window.location.origin}/sitemap.xml</span> in Google Search Console and create a Google Business Profile to show up in Maps.
        </p>
      </div>
    </Section>
  );
}

function LocaleForm({ value, save, busy }) {
  const [f, setF] = useState(value);
  return (
    <Section title="Currency & time" description="Changing the timezone affects which day new orders count towards. Past records keep their dates." busy={busy} onSave={() => save({ locale: f })}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
          {['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'GBP', 'EUR'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Input label="Number format" value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })} hint="en-NG, en-GH, en-US…" />
        <Input label="Timezone" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} hint="e.g. Africa/Lagos" />
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { reload: reloadPublic } = useSettings();
  const { data, error, loading, reload, setData } = useApi('/api/admin/settings');
  const [tab, setTab] = useState('restaurant');
  const [busy, setBusy] = useState(false);

  async function save(patch) {
    setBusy(true);
    try {
      const next = await api.put('/api/admin/settings', patch);
      setData(next);
      reloadPublic();
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const s = data.settings;

  return (
    <>
      <PageHeader title="Settings" description="Only the owner can see this page." />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
          {SECTIONS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={cx('shrink-0 rounded-xl px-3 py-2 text-left text-sm font-semibold', tab === key ? 'bg-coal-950 text-white' : 'text-stone-600 hover:bg-white')}>
              {label}
            </button>
          ))}
        </nav>
        <div className="max-w-3xl min-w-0">
          {tab === 'restaurant' && <RestaurantForm key={JSON.stringify(s.restaurant)} value={s.restaurant} save={save} busy={busy} />}
          {tab === 'hours' && <HoursForm value={s.hours} save={save} busy={busy} />}
          {tab === 'ordering' && <OrderingForm value={s.ordering} save={save} busy={busy} />}
          {tab === 'payments' && <PaymentsForm value={s.payments} paystack={data.paystack_configured} save={save} busy={busy} />}
          {tab === 'seo' && <SeoForm value={s.seo} restaurant={s.restaurant} save={save} busy={busy} />}
          {tab === 'locale' && <LocaleForm value={s.locale} save={save} busy={busy} />}
        </div>
      </div>
    </>
  );
}
