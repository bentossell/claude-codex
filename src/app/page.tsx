import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreateTaskSection } from '@/components/CreateTaskSection';
import { TaskTabs } from '@/components/TaskTabs';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  
  // Debug logging
  console.log('HomePage: Session user ID:', session?.user?.id);

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Claude Codex
        </h1>
        <p className="text-gray-600 mb-8">
          AI-powered code task management. Describe what you want to build, and let Claude implement it.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
        >
          Sign in with GitHub
        </Link>
      </div>
    );
  }

  // Fix user ID if it's a GitHub ID
  let userId = session.user.id;
  if (userId && /^\d+$/.test(userId)) {
    console.log('HomePage: GitHub ID detected, looking up user');
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
      console.log('HomePage: Found user with ID:', userId);
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      authorId: userId,
      status: { not: 'ARCHIVED' }
    },
    include: {
      author: true,
      _count: {
        select: { codeChanges: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const archivedTasks = await prisma.task.findMany({
    where: {
      authorId: userId,
      status: 'ARCHIVED'
    },
    include: {
      author: true,
      _count: {
        select: { codeChanges: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="bg-white min-h-full">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <CreateTaskSection />
        <div className="mt-12">
          <TaskTabs tasks={tasks} archivedTasks={archivedTasks} />
        </div>
      </div>
    </div>
  );
}