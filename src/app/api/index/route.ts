import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { codebaseIndex } from '@/lib/codebase-index';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { repository, branch = 'main', force = false } = await request.json();
    
    if (!repository) {
      return NextResponse.json({ error: 'Repository is required' }, { status: 400 });
    }

    logger.info('API:Index', 'Index request', { repository, branch, force });

    if (force) {
      logger.info('API:Index', 'Force reindexing repository');
      await codebaseIndex.indexRepository(repository, branch);
    } else {
      const needsUpdate = await codebaseIndex.needsUpdate(repository, branch);
      if (needsUpdate) {
        logger.info('API:Index', 'Repository needs update, reindexing');
        await codebaseIndex.indexRepository(repository, branch);
      } else {
        logger.info('API:Index', 'Repository index is up to date');
      }
    }

    const stats = await codebaseIndex.getRepositoryStats(repository);

    return NextResponse.json({
      success: true,
      message: 'Repository indexed successfully',
      data: stats
    });

  } catch (error) {
    logger.error('API:Index', 'Error indexing repository', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to index repository',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const repository = searchParams.get('repository');

    if (!repository) {
      return NextResponse.json({ error: 'Repository is required' }, { status: 400 });
    }

    const stats = await codebaseIndex.getRepositoryStats(repository);

    if (!stats) {
      return NextResponse.json({ error: 'Repository not indexed' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('API:Index', 'Error getting repository stats', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get repository stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}