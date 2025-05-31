'use client';

import { Task } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { GitBranch, GitCommit, Clock, Circle, CheckCircle2, Eye, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'OPEN':
        return <Circle className="h-4 w-4 text-green-500" />;
      case 'IN_PROGRESS':
        return <div className="h-4 w-4 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin" />;
      case 'REVIEWING':
        return <Eye className="h-4 w-4 text-blue-500" />;
      case 'MERGED':
        return <CheckCircle2 className="h-4 w-4 text-purple-500" />;
      case 'ARCHIVED':
        return <Archive className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: Task['status']) => {
    switch (status) {
      case 'OPEN':
        return 'Open';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'REVIEWING':
        return 'Reviewing';
      case 'MERGED':
        return 'Merged';
      case 'ARCHIVED':
        return 'Archived';
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'OPEN':
        return 'default';
      case 'IN_PROGRESS':
        return 'secondary';
      case 'REVIEWING':
        return 'default';
      case 'MERGED':
        return 'default';
      case 'ARCHIVED':
        return 'secondary';
    }
  };

  if (tasks.length === 0) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50 p-12">
        <div className="text-center">
          <Circle className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-2">No tasks yet</p>
          <p className="text-sm text-zinc-500">Create your first task to get started</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <Link
          key={task.id}
          href={`/tasks/${task.id}`}
          className="block group"
        >
          <Card className="border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900/70">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium text-zinc-100 group-hover:text-white">
                      {task.title}
                    </h3>
                    <Badge variant={getStatusColor(task.status)} className="flex items-center gap-1">
                      {getStatusIcon(task.status)}
                      {getStatusLabel(task.status)}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-zinc-400 line-clamp-2">
                    {task.description}
                  </p>
                </div>
                
                <span className="text-xs text-zinc-500 ml-4">
                  #{task.id.slice(-6)}
                </span>
              </div>
              
              <div className="flex items-center gap-6 text-xs text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span className="font-mono">{task.repository}</span>
                  <span className="text-zinc-600">/</span>
                  <span className="font-mono">{task.branch}</span>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDistanceToNow(new Date(task.createdAt))} ago</span>
                </div>

                {task.metrics && (
                  <div className="flex items-center gap-1.5">
                    <GitCommit className="h-3.5 w-3.5" />
                    <span className="text-green-500">+{task.metrics.additions}</span>
                    <span className="text-red-500">-{task.metrics.deletions}</span>
                    <span className="text-zinc-600">in {task.metrics.filesChanged} files</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}