import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  // Only allow authenticated users to view logs
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const logFile = path.join(process.cwd(), 'app.log');
    
    if (!fs.existsSync(logFile)) {
      return NextResponse.json({ logs: [] });
    }

    // Force fresh read without caching
    const stats = fs.statSync(logFile);
    const content = fs.readFileSync(logFile, 'utf-8');
    
    const logs = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line };
        }
      })
      .slice(-100); // Last 100 entries

    return NextResponse.json({ 
      logs,
      fileSize: stats.size,
      lastModified: stats.mtime
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read logs' },
      { status: 500 }
    );
  }
}