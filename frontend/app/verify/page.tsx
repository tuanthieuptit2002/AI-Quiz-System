import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';
import { Loading } from '@/components/ui';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthScreen mode="verify" />
    </Suspense>
  );
}
