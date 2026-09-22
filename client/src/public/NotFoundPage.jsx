import { Link } from 'react-router';
import Seo from '../components/Seo';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <Seo title="Page not found" noindex />
      <p className="font-display text-7xl font-extrabold text-ember-500">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">This page went up in smoke</h1>
      <p className="mt-2 text-stone-600">The link may be old, or the dish may have come off the menu.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/menu" className="inline-flex h-11 items-center rounded-full bg-ember-500 px-5 text-sm font-semibold text-white">
          See the menu
        </Link>
        <Link to="/" className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold ring-1 ring-stone-300">
          Home
        </Link>
      </div>
    </div>
  );
}
