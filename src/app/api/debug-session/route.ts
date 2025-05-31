import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  // Get all users for comparison
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      githubId: true,
      name: true
    }
  });
  
  // Get all tasks
  const tasks = await prisma.task.findMany({
    select: {
      id: true,
      title: true,
      authorId: true,
      createdAt: true
    }
  });
  
  return NextResponse.json({
    session: session,
    sessionUserId: session?.user?.id,
    sessionUserEmail: session?.user?.email,
    databaseUsers: users,
    tasks: tasks,
    analysis: {
      sessionUserMatchesDbUser: users.some(u => u.id === session?.user?.id),
      sessionEmailMatchesDbUser: users.some(u => u.email === session?.user?.email),
      tasksForSessionUser: tasks.filter(t => t.authorId === session?.user?.id).length
    }
  });
}