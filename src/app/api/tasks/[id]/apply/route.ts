import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { Octokit } from '@octokit/rest';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: taskId } = await params;
  logger.info('API:Apply', 'Applying changes and creating PR', { taskId });

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

    // Get task with code changes
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        author: true,
        codeChanges: true
      }
    });

    if (!task || task.authorId !== userId) {
      logger.warn('API:Apply', 'Task not found or unauthorized', { taskId, userId });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.codeChanges.length === 0) {
      return NextResponse.json({ error: 'No code changes to apply' }, { status: 400 });
    }

    // Initialize Octokit with GitHub token
    const token = session.accessToken || process.env.GITHUB_ACCESS_TOKEN;
    if (!token) {
      logger.error('API:Apply', 'No GitHub token available');
      return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
    }

    const octokit = new Octokit({ auth: token });

    // Parse repository owner and name
    const [owner, repo] = task.repository.split('/');
    const branchName = `codex-${task.id.slice(-8)}-${Date.now()}`;
    
    logger.info('API:Apply', 'Creating branch', { 
      repository: task.repository,
      branchName,
      baseBranch: task.branch
    });

    try {
      // Get the default branch SHA
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${task.branch}`
      });
      const baseSha = refData.object.sha;

      // Create new branch
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha
      });

      logger.info('API:Apply', 'Branch created, applying changes');

      // Apply each code change
      for (const change of task.codeChanges) {
        logger.debug('API:Apply', 'Applying change', { 
          file: change.filePath,
          action: change.action 
        });

        if (change.action === 'delete') {
          // Delete file
          try {
            const { data: fileData } = await octokit.repos.getContent({
              owner,
              repo,
              path: change.filePath,
              ref: branchName
            });

            await octokit.repos.deleteFile({
              owner,
              repo,
              path: change.filePath,
              message: `Delete ${change.filePath}`,
              sha: (fileData as any).sha,
              branch: branchName
            });
          } catch (error) {
            logger.warn('API:Apply', 'File to delete not found', { file: change.filePath });
          }
        } else {
          // Create or update file
          let sha: string | undefined;
          
          // Try to get existing file SHA for updates
          if (change.action === 'modify') {
            try {
              const { data: fileData } = await octokit.repos.getContent({
                owner,
                repo,
                path: change.filePath,
                ref: branchName
              });
              sha = (fileData as any).sha;
            } catch {
              // File doesn't exist, will create it
            }
          }

          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: change.filePath,
            message: `${change.action === 'create' ? 'Create' : 'Update'} ${change.filePath}`,
            content: Buffer.from(change.newContent).toString('base64'),
            branch: branchName,
            sha
          });
        }
      }

      logger.info('API:Apply', 'Creating pull request');

      // Create pull request
      const prBody = `## Summary
${task.description}

## Changes
${task.codeChanges.map(change => 
  `- ${change.action === 'create' ? '➕' : change.action === 'modify' ? '📝' : '❌'} ${change.filePath}`
).join('\n')}

## Metrics
- Files changed: ${task.codeChanges.length}
- Additions: ${(task.metrics as any)?.additions || 0}
- Deletions: ${(task.metrics as any)?.deletions || 0}

---
🤖 Generated by [Claude Codex](https://github.com/bentossell/codex)
Task ID: ${task.id}`;

      const { data: pr } = await octokit.pulls.create({
        owner,
        repo,
        title: task.title,
        body: prBody,
        head: branchName,
        base: task.branch
      });

      logger.info('API:Apply', 'Pull request created', { 
        prNumber: pr.number,
        prUrl: pr.html_url 
      });

      // Update task status and store PR info
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          pullRequestUrl: pr.html_url,
          pullRequestNumber: pr.number
        }
      });

      // Mark changes as applied
      await prisma.codeChange.updateMany({
        where: { taskId },
        data: { 
          approved: true,
          appliedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          pullRequestUrl: pr.html_url,
          pullRequestNumber: pr.number,
          branch: branchName
        }
      });

    } catch (error: any) {
      logger.error('API:Apply', 'GitHub API error', error);
      
      // Log more details about the error
      if (error.response) {
        logger.error('API:Apply', 'GitHub API response', null, {
          status: error.response.status,
          data: error.response.data
        });
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to create pull request',
          details: error.message 
        },
        { status: 500 }
      );
    }

  } catch (error) {
    logger.error('API:Apply', 'Error applying changes', error);
    return NextResponse.json(
      { error: 'Failed to apply changes' },
      { status: 500 }
    );
  }
}