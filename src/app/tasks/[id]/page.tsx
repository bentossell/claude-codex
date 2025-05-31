import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TaskDetailClient } from '@/components/TaskDetailClient';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return notFound();

  // Fix user ID if it's a GitHub ID
  let userId = session.user.id;
  if (userId && /^\d+$/.test(userId)) {
    const user = await prisma.user.findFirst({
      where: { 
        OR: [
          { githubId: userId },
          { email: session.user.email }
        ]
      }
    });
    if (user) {
      userId = user.id;
    }
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      author: true,
      codeChanges: true,
      claudeJobs: {
        orderBy: { generatedAt: 'desc' },
        take: 5
      }
    }
  });

  if (!task || task.authorId !== userId) {
    return notFound();
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Back button */}
        <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to tasks</span>
        </Link>

        {/* Client-side task detail with real-time updates */}
        <TaskDetailClient initialTask={task} />
      </div>
    </div>
  );
}