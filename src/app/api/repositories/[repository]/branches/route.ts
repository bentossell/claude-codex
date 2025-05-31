import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ repository: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    logger.debug('API:Branches:GET', 'Session check', { 
      hasSession: !!session,
      hasAccessToken: !!session?.accessToken,
      hasUser: !!session?.user
    });
    
    if (!session?.user) {
      logger.warn('API:Branches:GET', 'Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { repository } = await params;
    const decodedRepo = decodeURIComponent(repository);

    // Use the GitHub token from environment if accessToken is not available
    const token = session.accessToken || process.env.GITHUB_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
    
    if (!token) {
      logger.error('API:Branches:GET', 'No GitHub token available');
      return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
    }
    
    logger.info('API:Branches:GET', 'Fetching branches', { repository: decodedRepo });
    
    const response = await fetch(
      `https://api.github.com/repos/${decodedRepo}/branches`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch branches' },
        { status: response.status }
      );
    }

    const branches = await response.json();
    const branchNames = branches.map((branch: any) => branch.name);

    return NextResponse.json({ branches: branchNames });
  } catch (error) {
    console.error('Error fetching branches:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}