import { Pencil, Plus, Search, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FoodImage } from '../../components/FoodImage';
import { Badge, Button, Card, cx, EmptyState, ErrorState, Input, Modal, PageLoader, Select, Switch, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { TAG_LABEL } from '../../lib/constants';
import { money, pct, toMajor, toMinor } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { MoneyInput, PageHeader, Table, Td, Th } from '../components';
import ImageUpload from '../ImageUpload';

function marginTone(pctValue) {
  if (pctValue >= 60) return 'text-emerald-700';
  if (pctValue >= 45) return 'text-amber-700';
  return 'text-rose-700';
}

function ItemForm({ item, categories, inventory, tags, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: item?.name ?? '',
    categoryId: item?.category_id ?? categories[0]?.id ?? '',
    price: toMajor(item?.price),
    description: item?.description ?? '',
    imageUrl: item?.image_url ?? '',
    tags: item?.tags ?? [],
    prepMinutes: item?.prep_minutes ?? '',
    sortOrder: item?.sort_order ?? 0,
    available: item ? Boolean(item.available) : true,
    featured: item ? Boolean(item.featured) : false,
    recipe: (item?.recipe ?? []).map((r) => ({ inventoryItemId: r.inventory_item_id, quantity: String(r.quantity) })),
  }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const stockById = new Map(inventory.map((i) => [i.id, i]));

  const price = toMinor(form.price);
  const foodCost = Math.round(
    form.recipe.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (stockById.get(Number(r.inventoryItemId))?.cost_per_unit ?? 0), 0),
  );
  const margin = price ? ((price - foodCost) / price) * 100 : 0;

  async function save() {
    const recipe = form.recipe
      .filter((r) => r.inventoryItemId && Number(r.quantity) > 0)
      .map((r) => ({ inventoryItemId: Number(r.inventoryItemId), quantity: Number(r.quantity) }));
    const body = {
      name: form.name.trim(),
      categoryId: Number(form.categoryId),
      price,
      description: form.description.trim(),
      imageUrl: form.imageUrl,
      tags: form.tags,
      prepMinutes: form.prepMinutes === '' ? null : Number(form.prepMinutes),
      sortOrder: Number(form.sortOrder) || 0,
      available: form.available,
      featured: form.featured,
      recipe,
    };
    setBusy(true);
    try {
      const { item: saved } = item ? await api.patch(`/api/admin/menu-items/${item.id}`, body) : await api.post('/api/admin/menu-items', body);
      toast.success(`${saved.name} saved`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm(`Remove ${item.name} from the menu? Past orders keep their records.`)) return;
    try {
      await api.delete(`/api/admin/menu-items/${item.id}`);
      toast.success(`${item.name} removed from the menu`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'Add a dish'}
      footer={
        <>
          {item && (
            <Button variant="danger-ghost" className="mr-auto" onClick={archive}>
              <Trash2 className="size-4" /> Remove from menu
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.name.trim() || !form.categoryId || !form.price} onClick={save}>
            Save dish
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <MoneyInput label="Price" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <Textarea label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} hint="Shown on the website and read by Google. Describe taste, portion and what it comes with." />
          <div>
            <p className="mb-1.5 text-sm font-medium">Labels</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const on = form.tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('tags', on ? form.tags.filter((x) => x !== t) : [...form.tags, t])}
                    className={cx('rounded-full px-3 py-1.5 text-sm font-medium ring-1', on ? 'bg-coal-950 text-white ring-coal-950' : 'ring-stone-300 hover:bg-stone-50')}
                  >
                    {TAG_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prep time (minutes)" type="number" min="0" value={form.prepMinutes} onChange={(e) => set('prepMinutes', e.target.value)} />
            <Input label="Position in category" type="number" min="0" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} hint="Lower numbers show first." />
          </div>

          <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Recipe (stock used per serving)</p>
                <p className="text-xs text-stone-500">Each sale deducts these from inventory, and the dish shows as sold out when stock runs short.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!inventory.length}
                onClick={() => set('recipe', [...form.recipe, { inventoryItemId: '', quantity: '' }])}
              >
                <Plus className="size-4" /> Ingredient
              </Button>
            </div>
            {form.recipe.length > 0 && (
              <ul className="mt-3 space-y-2">
                {form.recipe.map((r, i) => {
                  const stock = stockById.get(Number(r.inventoryItemId));
                  return (
                    <li key={i} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
                      <select
                        value={r.inventoryItemId}
                        onChange={(e) => set('recipe', form.recipe.map((x, j) => (j === i ? { ...x, inventoryItemId: e.target.value } : x)))}
                        className="h-10 rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-ember-500 focus:outline-none"
                      >
                        <option value="">Choose stock item…</option>
                        {inventory.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.unit})
                          </option>
                        ))}
                      </select>
                      <div className="relative">
                        <input
                          value={r.quantity}
                          inputMode="decimal"
                          onChange={(e) => set('recipe', form.recipe.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                          placeholder="Qty"
                          className="h-10 w-full rounded-xl border-0 bg-white pr-10 pl-3 text-sm ring-1 ring-stone-300 focus:ring-2 focus:ring-ember-500 focus:outline-none"
                        />
                        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-stone-400">{stock?.unit}</span>
                      </div>
                      <button type="button" onClick={() => set('recipe', form.recipe.filter((_, j) => j !== i))} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove ingredient">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {price > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-white p-2 ring-1 ring-stone-200">
                  <p className="text-xs text-stone-500">Food cost</p>
                  <p className="font-semibold">{money(foodCost)}</p>
                </div>
                <div className="rounded-xl bg-white p-2 ring-1 ring-stone-200">
                  <p className="text-xs text-stone-500">Profit per plate</p>
                  <p className="font-semibold">{money(price - foodCost)}</p>
                </div>
                <div className="rounded-xl bg-white p-2 ring-1 ring-stone-200">
                  <p className="text-xs text-stone-500">Margin</p>
                  <p className={cx('font-semibold', marginTone(margin))}>{pct(margin)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <ImageUpload value={form.imageUrl} onChange={(url) => set('imageUrl', url)} name={form.name} />
          <Switch checked={form.available} onChange={(v) => set('available', v)} label="Available" description="Turn off when you run out for the day." />
          <Switch checked={form.featured} onChange={(v) => set('featured', v)} label="Feature on home page" description="Shown under Crowd favourites." />
        </div>
      </div>
    </Modal>
  );
}

function CategoryForm({ category, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    sortOrder: category?.sort_order ?? 0,
    active: category ? Boolean(category.active) : true,
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, sortOrder: Number(form.sortOrder) || 0 };
      if (category) await api.patch(`/api/admin/categories/${category.id}`, body);
      else await api.post('/api/admin/categories', body);
      toast.success('Category saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : 'Add a category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.name.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Textarea label="Short description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Input label="Position" type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} hint="Lower numbers show first on the menu." />
        <Switch checked={form.active} onChange={(active) => setForm({ ...form, active })} label="Show on the website" />
      </div>
    </Modal>
  );
}

export default function MenuManagerPage() {
  const toast = useToast();
  const items = useApi('/api/admin/menu-items');
  const categories = useApi('/api/admin/categories');
  const inventory = useApi('/api/admin/inventory');
  const [tab, setTab] = useState('dishes');
  const [editing, setEditing] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items.data?.items ?? []).filter((i) => (filter === 'all' || i.category_id === Number(filter)) && (!s || i.name.toLowerCase().includes(s)));
  }, [items.data, filter, q]);

  const reloadAll = () => {
    items.reload();
    categories.reload();
  };

  async function quickToggle(item, field) {
    const next = !item[field];
    items.setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, [field]: next ? 1 : 0 } : i)) }));
    try {
      await api.patch(`/api/admin/menu-items/${item.id}`, { [field]: next });
    } catch (err) {
      toast.error(err.message);
      items.reload();
    }
  }

  async function deleteCategory(c) {
    if (!window.confirm(`Delete the ${c.name} category?`)) return;
    try {
      await api.delete(`/api/admin/categories/${c.id}`);
      toast.success('Category deleted');
      categories.reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if ((items.loading && !items.data) || (categories.loading && !categories.data)) return <PageLoader />;
  if (items.error || categories.error) return <ErrorState error={items.error || categories.error} onRetry={reloadAll} />;

  const cats = categories.data.categories;

  return (
    <>
      <PageHeader
        title="Menu"
        description="Changes show on the website straight away. Removing a dish keeps its sales history."
        actions={
          tab === 'dishes' ? (
            <Button onClick={() => setEditing('new')} disabled={!cats.length}>
              <Plus className="size-4" /> Add dish
            </Button>
          ) : (
            <Button onClick={() => setEditingCategory('new')}>
              <Plus className="size-4" /> Add category
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-stone-200">
          {[
            ['dishes', `Dishes (${items.data.items.length})`],
            ['categories', `Categories (${cats.length})`],
          ].map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={cx('rounded-xl px-4 py-2 text-sm font-semibold', tab === value ? 'bg-coal-950 text-white' : 'text-stone-600 hover:bg-stone-100')}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'dishes' && (
          <>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-11 rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-stone-200">
              <option value="all">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="relative min-w-48 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes" className="h-11 w-full rounded-xl border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
            </div>
          </>
        )}
      </div>

      {tab === 'dishes' ? (
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={UtensilsCrossed} title={cats.length ? 'No dishes yet' : 'Create a category first'}>
              {cats.length ? 'Add your first dish to put it on the website.' : 'Dishes live inside categories such as Grills or Drinks.'}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Dish</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Food cost</Th>
                  <Th align="right">Margin</Th>
                  <Th>Available</Th>
                  <Th>Featured</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-stone-50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="size-12 shrink-0">
                          <FoodImage src={i.image_url} name={i.name} category={i.category_name} rounded="rounded-xl" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold">{i.name}</p>
                          <p className="text-xs text-stone-500">
                            {i.category_name}
                            {i.sold_out && (
                              <Badge tone="rose" className="ml-2">
                                Out of stock
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td align="right" className="font-semibold">
                      {money(i.price)}
                    </Td>
                    <Td align="right" className="text-stone-600">
                      {i.recipe.length ? money(i.food_cost) : <span className="text-stone-400">No recipe</span>}
                    </Td>
                    <Td align="right" className={i.recipe.length ? cx('font-semibold', marginTone(i.margin_pct)) : 'text-stone-400'}>
                      {i.recipe.length ? pct(i.margin_pct) : '—'}
                    </Td>
                    <Td>
                      <Switch checked={Boolean(i.available)} onChange={() => quickToggle(i, 'available')} />
                    </Td>
                    <Td>
                      <button onClick={() => quickToggle(i, 'featured')} aria-label="Toggle featured" className="rounded-lg p-1.5 hover:bg-stone-100">
                        <Star className={cx('size-5', i.featured ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
                      </button>
                    </Td>
                    <Td align="right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th align="right">Dishes</Th>
                <Th align="right">Position</Th>
                <Th>On website</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <p className="font-semibold">{c.name}</p>
                    {c.description && <p className="max-w-md truncate text-xs text-stone-500">{c.description}</p>}
                  </Td>
                  <Td align="right">{c.item_count}</Td>
                  <Td align="right">{c.sort_order}</Td>
                  <Td>{c.active ? <Badge tone="emerald">Visible</Badge> : <Badge>Hidden</Badge>}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingCategory(c)}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                      <Button size="sm" variant="danger-ghost" onClick={() => deleteCategory(c)} disabled={c.item_count > 0} title={c.item_count ? 'Move its dishes first' : ''}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {editing && (
        <ItemForm
          item={editing === 'new' ? null : editing}
          categories={cats}
          inventory={inventory.data?.items ?? []}
          tags={items.data.tags}
          onClose={() => setEditing(null)}
          onSaved={reloadAll}
        />
      )}
      {editingCategory && <CategoryForm category={editingCategory === 'new' ? null : editingCategory} onClose={() => setEditingCategory(null)} onSaved={reloadAll} />}
    </>
  );
}
