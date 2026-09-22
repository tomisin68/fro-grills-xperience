import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import Seo from '../components/Seo';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';

/** Paystack sends customers back here with ?reference=…; the server verifies it before anything is marked paid. */
export default function PaymentCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);
  const reference = params.get('reference') || params.get('trxref');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!reference) {
      setError('This link is missing its payment reference.');
      return;
    }
    api
      .post('/api/public/payments/paystack/verify', { reference })
      .then((res) => navigate(`/track/${res.order_number}?t=${res.token}${res.paid ? '&paid=1' : ''}`, { replace: true }))
      .catch((err) => setError(err.message));
  }, [reference, navigate]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Seo title="Confirming payment" noindex />
      {error ? (
        <>
          <p className="font-display text-2xl font-bold">We could not confirm your payment</p>
          <p className="text-stone-600">{error}</p>
          <p className="text-sm text-stone-500">If money left your account, it is safe. Contact us with reference {reference} and we will sort it out.</p>
          <Link to="/" className="mt-2 font-semibold text-ember-600">
            Back to the home page
          </Link>
        </>
      ) : (
        <>
          <Spinner className="size-10" />
          <p className="font-display text-xl font-bold">Confirming your payment…</p>
          <p className="text-sm text-stone-500">Please keep this page open.</p>
        </>
      )}
    </div>
  );
}
