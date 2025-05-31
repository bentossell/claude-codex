import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const logFile = path.join(process.cwd(), 'app.log');
    
    if (!fs.existsSync(logFile)) {
      return new Response('No logs found', { 
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store'
        }
      });
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const lastLines = lines.slice(-50);
    
    const formatted = lastLines.map(line => {
      try {
        const log = JSON.parse(line);
        const time = new Date(log.timestamp).toLocaleTimeString();
        const level = (log.level || 'LOG').toUpperCase().padEnd(5);
        const component = (log.component || '-').padEnd(20);
        return `[${time}] [${level}] [${component}] ${log.message}`;
      } catch {
        return line;
      }
    }).join('\n');

    return new Response(formatted, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Timestamp': Date.now().toString()
      }
    });
  } catch (error) {
    return new Response('Error reading logs', { status: 500 });
  }
}