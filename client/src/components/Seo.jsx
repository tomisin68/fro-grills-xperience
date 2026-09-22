import { useSettings } from '../lib/settings';

/** React 19 hoists these tags into <head>. */
export default function Seo({ title, description, image, noindex }) {
  const { settings } = useSettings();
  const r = settings.restaurant;
  const fullTitle = title ? `${title} | ${r.name}` : settings.seo.title || `${r.name} | ${r.tagline}`;
  const desc = description || settings.seo.description || r.description;
  const img = image || r.heroImageUrl || r.logoUrl;
  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {settings.seo.keywords && <meta name="keywords" content={settings.seo.keywords} />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      {img && <meta property="og:image" content={img.startsWith('http') ? img : `${window.location.origin}${img}`} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </>
  );
}
