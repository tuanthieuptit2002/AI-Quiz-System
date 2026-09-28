import { notFound } from 'next/navigation';
import { Workspace } from '@/components/workspace';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z-]{1,60}$/.test(slug)) notFound();
  return <Workspace view="docs" docSlug={slug} />;
}
