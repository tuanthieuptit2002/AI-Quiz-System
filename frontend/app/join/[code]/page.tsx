import { notFound } from 'next/navigation';
import { JoinClass } from '@/components/classes/join-class';

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-f\d]{10}$/i.test(code)) notFound();
  return <JoinClass code={code.toUpperCase()} />;
}
