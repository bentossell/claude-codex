import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info('API:Task:GET', 'Fetching task', { taskId: id });
  
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    logger.warn('API:Task:GET', 'Unauthorized request - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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

    const task = await prisma.task.findFirst({
      where: {
        id: id,
        authorId: userId
      },
      include: {
        author: true,
        codeChanges: true,
        claudeJobs: {
          orderBy: { generatedAt: 'desc' },
          take: 10
        }
      }
    });

    if (!task) {
      logger.warn('API:Task:GET', 'Task not found', { taskId: id });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    logger.info('API:Task:GET', 'Task fetched successfully', { taskId: task.id });
    return NextResponse.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('API:Task:GET', 'Error fetching task', error, { taskId: id });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info('API:Task:PATCH', 'Updating task', { taskId: id });
  
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    logger.warn('API:Task:PATCH', 'Unauthorized request - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    logger.debug('API:Task:PATCH', 'Request body', body);

    // Ensure we have a valid user ID (handle GitHub ID vs database ID)
    let userId = session.user.id;
    
    if (userId && /^\d+$/.test(userId)) {
      logger.info('API:Task:PATCH', 'GitHub ID detected, looking up user', { githubId: userId });
      
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
        logger.info('API:Task:PATCH', 'Found user in database', { dbId: user.id });
      } else {
        logger.error('API:Task:PATCH', 'User not found in database', null, { 
          githubId: userId,
          email: session.user.email 
        });
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 400 }
        );
      }
    }

    // Verify the task exists and belongs to the user
    const existingTask = await prisma.task.findFirst({
      where: {
        id: id,
        authorId: userId
      }
    });

    if (!existingTask) {
      logger.warn('API:Task:PATCH', 'Task not found', { taskId: id, authorId: userId });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // If archiving, use DELETE instead to completely remove the task and its data
    if (body.status === 'ARCHIVED') {
      logger.info('API:Task:PATCH', 'Archiving task - deleting all related data', { taskId: id });
      
      // Delete related records first
      await prisma.codeChange.deleteMany({
        where: { taskId: id }
      });

      await prisma.claudeJob.deleteMany({
        where: { taskId: id }
      });

      // Delete the task
      await prisma.task.delete({
        where: { id: id }
      });

      logger.info('API:Task:PATCH', 'Task archived (deleted) successfully', { taskId: id });

      return NextResponse.json({
        success: true,
        message: 'Task archived successfully'
      });
    }

    // For other updates, just update the task
    const updatedTask = await prisma.task.update({
      where: { id: id },
      data: {
        ...body,
        updatedAt: new Date()
      },
      include: {
        author: true
      }
    });

    logger.info('API:Task:PATCH', 'Task updated successfully', { 
      taskId: updatedTask.id,
      status: updatedTask.status 
    });

    return NextResponse.json({
      success: true,
      data: updatedTask
    });
  } catch (error) {
    logger.error('API:Task:PATCH', 'Error updating task', error, { taskId: id });
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info('API:Task:DELETE', 'Deleting task', { taskId: id });
  
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    logger.warn('API:Task:DELETE', 'Unauthorized request - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Verify the task exists and belongs to the user
    const existingTask = await prisma.task.findFirst({
      where: {
        id: id,
        authorId: session.user.id
      }
    });

    if (!existingTask) {
      logger.warn('API:Task:DELETE', 'Task not found', { taskId: id });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete related records first
    await prisma.codeChange.deleteMany({
      where: { taskId: id }
    });

    await prisma.claudeJob.deleteMany({
      where: { taskId: id }
    });

    // Delete the task
    await prisma.task.delete({
      where: { id: id }
    });

    logger.info('API:Task:DELETE', 'Task deleted successfully', { taskId: id });

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    logger.error('API:Task:DELETE', 'Error deleting task', error, { taskId: id });
    return NextResponse.json(
      { success: false, error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}