import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { claudeService } from '@/lib/claude-service';
import { CreateTaskInput } from '@/types';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  logger.info('API:Tasks:GET', 'Fetching tasks');
  
  const session = await getServerSession(authOptions);
  logger.debug('API:Tasks:GET', 'Session data', { session });
  
  if (!session?.user) {
    logger.warn('API:Tasks:GET', 'Unauthorized request - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        authorId: session.user.id
      },
      include: {
        author: true,
        _count: {
          select: { codeChanges: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    logger.info('API:Tasks:GET', `Found ${tasks.length} tasks for user ${session.user.id}`);
    return NextResponse.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    logger.error('API:Tasks:GET', 'Error fetching tasks', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  logger.info('API:Tasks:POST', 'Creating new task');
  
  const session = await getServerSession(authOptions);
  logger.debug('API:Tasks:POST', 'Session data', { 
    hasSession: !!session,
    hasUser: !!session?.user,
    userId: session?.user?.id,
    userEmail: session?.user?.email 
  });
  
  if (!session?.user) {
    logger.warn('API:Tasks:POST', 'Unauthorized request - no session');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    logger.debug('API:Tasks:POST', 'Request body', body);
    
    const { title, description, repository, branch, generateCode, autoCreatePR = false } = body;

    // Ensure we have a valid user ID
    let userId = session.user.id;
    
    // Check if the user ID looks like a GitHub ID (all numeric)
    if (userId && /^\d+$/.test(userId)) {
      logger.warn('API:Tasks:POST', 'User ID appears to be GitHub ID, looking up actual user', { githubId: userId });
      
      // This is likely a GitHub ID, not our database ID
      const user = await prisma.user.findFirst({
        where: { 
          OR: [
            { githubId: userId },
            { email: session.user.email }
          ]
        }
      });
      
      if (user) {
        logger.info('API:Tasks:POST', 'Found user in database', { 
          dbId: user.id, 
          githubId: user.githubId,
          email: user.email 
        });
        userId = user.id;
      } else {
        logger.error('API:Tasks:POST', 'User not found in database', null, { 
          githubId: userId,
          email: session.user.email 
        });
        return NextResponse.json(
          { success: false, error: 'User not found. Please sign out and sign in again.' },
          { status: 400 }
        );
      }
    } else if (!userId && session.user.email) {
      // No user ID but we have email
      const user = await prisma.user.findUnique({
        where: { email: session.user.email }
      });
      
      if (user) {
        logger.info('API:Tasks:POST', 'Found user by email', { userId: user.id });
        userId = user.id;
      } else {
        logger.error('API:Tasks:POST', 'User not found in database', null, { email: session.user.email });
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 400 }
        );
      }
    }

    logger.info('API:Tasks:POST', 'Creating task', { 
      userId: userId,
      repository,
      branch 
    });

    // Create the task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        repository,
        branch,
        authorId: userId,
        status: 'OPEN'
      },
      include: {
        author: true
      }
    });

    logger.info('API:Tasks:POST', 'Task created successfully', { taskId: task.id });

    // If generateCode is true, start code generation
    if (generateCode) {
      logger.info('API:Tasks:POST', 'Starting code generation', { taskId: task.id });
      
      // Create a Claude job
      const claudeJob = await prisma.claudeJob.create({
        data: {
          taskId: task.id,
          prompt: description,
          model: 'claude-3-opus-20240229',
          status: 'pending'
        }
      });

      logger.info('API:Tasks:POST', 'Claude job created', { jobId: claudeJob.id });

      // Start async code generation
      generateCodeAsync(task.id, claudeJob.id, autoCreatePR);
    }

    return NextResponse.json({
      success: true,
      data: task
    });
  } catch (error) {
    logger.error('API:Tasks:POST', 'Error creating task', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create task', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function generateCodeAsync(taskId: string, jobId: string, autoCreatePR = false) {
  logger.info('CodeGeneration', 'Starting async code generation', { taskId, jobId });
  
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

    logger.info('CodeGeneration', 'Calling Claude service', { taskId });

    // Generate code using Claude
    const result = await claudeService.generateCode(task);

    logger.info('CodeGeneration', 'Claude response received', { 
      taskId,
      filesCount: result.files.length 
    });

    // Save code changes
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

    // Update task metrics
    const metrics = {
      additions: result.files.length * 10, // Rough estimate since we don't have proper diff
      deletions: result.files.length * 5,  // Rough estimate
      filesChanged: result.files.length
    };

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'IN_PROGRESS',
        metrics
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

    logger.info('CodeGeneration', 'Code generation completed successfully', { taskId });

    // Auto-create PR if requested
    if (autoCreatePR) {
      logger.info('CodeGeneration', 'Auto-creating pull request', { taskId });
      
      try {
        const response = await fetch(`${process.env.NEXTAUTH_URL}/api/tasks/${taskId}/apply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Pass session token if needed
          }
        });

        if (!response.ok) {
          logger.error('CodeGeneration', 'Failed to auto-create PR', null, { 
            taskId,
            status: response.status 
          });
        } else {
          const prData = await response.json();
          logger.info('CodeGeneration', 'Pull request created automatically', { 
            taskId,
            prUrl: prData.data?.pullRequestUrl 
          });
        }
      } catch (prError) {
        logger.error('CodeGeneration', 'Error auto-creating PR', prError, { taskId });
      }
    }
  } catch (error) {
    logger.error('CodeGeneration', 'Error generating code', error, { taskId, jobId });
    
    await prisma.claudeJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}