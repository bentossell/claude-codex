import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = process.env.GITHUB_ACCESS_TOKEN;
    
    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'GitHub access token not configured'
      }, { status: 500 });
    }

    // Fetch user's repositories
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('GitHub API error:', response.status, response.statusText);
      return NextResponse.json({
        success: false,
        error: `GitHub API error: ${response.statusText}`
      }, { status: response.status });
    }

    const repos = await response.json();
    
    // Transform the data to only include what we need
    const transformedRepos = repos.map((repo: any) => ({
      id: repo.id,
      full_name: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      default_branch: repo.default_branch,
      private: repo.private,
      description: repo.description
    }));

    return NextResponse.json({
      success: true,
      data: transformedRepos
    });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}