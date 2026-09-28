import { notFound } from 'next/navigation';
import { ExamRoom } from '@/components/exams/exam-room';
export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^[a-f\d]{24}$/i.test(runId)) notFound();
  return <ExamRoom runId={runId} />;
}
