import { notFound } from 'next/navigation';
import { Workspace } from '@/components/workspace';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  return <Workspace view="classes" classId={id} />;
}
