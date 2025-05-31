import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { claudeService } from '@/lib/claude-service';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: taskId } = await params;
  logger.info('API:Regenerate', 'Regenerating code for task', { taskId });

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

    // Get task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        author: true,
        codeChanges: true,
        claudeJobs: {
          orderBy: { generatedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!task || task.authorId !== userId) {
      logger.warn('API:Regenerate', 'Task not found or unauthorized', { taskId, userId });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete existing code changes
    await prisma.codeChange.deleteMany({
      where: { taskId }
    });

    // Create a new Claude job for regeneration
    const claudeJob = await prisma.claudeJob.create({
      data: {
        taskId,
        prompt: task.description, // Use original task description, not "regenerate"
        model: 'claude-3-opus-20240229',
        status: 'pending'
      }
    });

    logger.info('API:Regenerate', 'Starting code regeneration', { taskId, jobId: claudeJob.id });

    // Start async code regeneration
    regenerateCodeAsync(taskId, claudeJob.id);

    return NextResponse.json({
      success: true,
      message: 'Code regeneration started',
      data: { jobId: claudeJob.id }
    });

  } catch (error) {
    logger.error('API:Regenerate', 'Error starting regeneration', error, { taskId });
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to start regeneration',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function regenerateCodeAsync(taskId: string, jobId: string) {
  logger.info('CodeRegeneration', 'Starting async code regeneration', { taskId, jobId });
  
  try {
    // Update job status
    await prisma.claudeJob.update({
      where: { id: jobId },
      data: { status: 'processing' }
    });

    // Get task details
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { author: true }
    });

    if (!task) {
      throw new Error('Task not found');
    }

    logger.info('CodeRegeneration', 'Calling Claude service', { taskId });

    // Generate new code using Claude
    const result = await claudeService.generateCode(task);

    logger.info('CodeRegeneration', 'Claude response received', { 
      taskId,
      filesCount: result.files.length 
    });

    // Save new code changes
    const codeChanges = await Promise.all(
      result.files.map((file: any) =>
        prisma.codeChange.create({
          data: {
            taskId,
            filePath: file.path,
            action: file.action,
            previousContent: file.previousContent || '',
            newContent: file.content,
            diff: file.diff || `Modified ${file.path}`
          }
        })
      )
    );

    // Update task metrics and status
    const metrics = {
      additions: result.files.length * 10, // Rough estimate since we don't have proper diff
      deletions: result.files.length * 5,  // Rough estimate
      filesChanged: result.files.length
    };

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'IN_PROGRESS',
        metrics,
        updatedAt: new Date()
      }
    });

    // Update job status
    await prisma.claudeJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        response: result.summary,
        tokensUsed: result.tokensUsed
      }
    });

    logger.info('CodeRegeneration', 'Code regeneration completed successfully', { taskId });

  } catch (error) {
    logger.error('CodeRegeneration', 'Error regenerating code', error, { taskId, jobId });
    
    // Update job status to failed
    await prisma.claudeJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    // Reset task status if needed
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'OPEN',
        updatedAt: new Date()
      }
    });
  }
}