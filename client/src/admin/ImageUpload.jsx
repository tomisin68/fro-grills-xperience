import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { FoodImage } from '../components/FoodImage';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

export default function ImageUpload({ value, onChange, name, aspect = 'aspect-[4/3]', label = 'Photo' }) {
  const input = useRef(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function upload(file) {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    try {
      const { url } = await api.post('/api/admin/uploads', body);
      onChange(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      input.current.value = '';
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className={`${aspect} w-full overflow-hidden rounded-2xl ring-1 ring-stone-200`}>
        <FoodImage src={value} name={name} rounded="rounded-2xl" />
      </div>
      <div className="mt-2 flex gap-2">
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => input.current.click()}>
          <ImagePlus className="size-4" /> {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files[0])} />
      <p className="mt-1 text-xs text-stone-500">JPG, PNG or WebP up to 5 MB. Bright, close-up photos sell best.</p>
    </div>
  );
}
