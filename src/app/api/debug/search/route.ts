import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { codebaseIndex } from '@/lib/codebase-index';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { repository, taskDescription } = await request.json();
    
    if (!repository || !taskDescription) {
      return NextResponse.json({ error: 'Repository and taskDescription are required' }, { status: 400 });
    }

    // Get search results
    const relevantFiles = await codebaseIndex.searchRelevantFiles(repository, taskDescription, 15);
    
    // Get repository stats
    const stats = await codebaseIndex.getRepositoryStats(repository);

    return NextResponse.json({
      success: true,
      data: {
        taskDescription,
        repository,
        totalFilesInIndex: stats?.totalFiles || 0,
        relevantFilesFound: relevantFiles.length,
        files: relevantFiles.map(result => ({
          path: result.file.path,
          fileType: result.file.fileType,
          score: result.score,
          reason: result.reason,
          size: result.file.size,
          contentPreview: result.file.content.substring(0, 200) + '...'
        }))
      }
    });

  } catch (error) {
    console.error('Debug search error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to search files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}