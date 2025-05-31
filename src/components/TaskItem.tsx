'use client';

import { Task } from '@/types';
import { format } from 'date-fns';
import Link from 'next/link';
import { GitPullRequest } from 'lucide-react';

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'MERGED':
        return 'bg-purple-100 text-purple-700';
      case 'ARCHIVED':
        return 'bg-red-100 text-red-700';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-700';
      case 'REVIEWING':
        return 'bg-blue-100 text-blue-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: Task['status']) => {
    switch (status) {
      case 'MERGED':
        return 'Merged';
      case 'ARCHIVED':
        return 'Closed';
      default:
        return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div className="py-4 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-gray-900 truncate">
              {task.title}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {format(new Date(task.createdAt), 'MMM d')} · {task.repository}
            </p>
          </div>
          
          <div className="flex items-center gap-3 ml-4">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${getStatusColor(task.status)}`}>
              {getStatusLabel(task.status)}
            </span>
            
            {task.pullRequestUrl && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(task.pullRequestUrl, '_blank', 'noopener,noreferrer');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <GitPullRequest className="h-4 w-4" />
              </button>
            )}
            
            {task.metrics && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-600">+{task.metrics.additions}</span>
                <span className="text-gray-600">-{task.metrics.deletions}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}