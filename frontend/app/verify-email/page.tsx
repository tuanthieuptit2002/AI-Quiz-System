'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loading } from '@/components/ui';

function RedirectToVerify() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const query = params.toString();
    router.replace(query ? `/verify?${query}` : '/verify');
  }, [params, router]);
  return <Loading />;
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <RedirectToVerify />
    </Suspense>
  );
}
