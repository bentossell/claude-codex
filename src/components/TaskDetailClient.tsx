'use client';

import { useState, useEffect, useRef } from 'react';
import { CodeDiffViewer } from '@/components/CodeDiffViewer';
import { TaskActions } from '@/components/TaskActions';
import { RepositoryIndexStatus } from '@/components/RepositoryIndexStatus';
import { GitBranch, Clock, User, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TaskDetailClientProps {
  initialTask: any;
}

export function TaskDetailClient({ initialTask }: TaskDetailClientProps) {
  const [task, setTask] = useState(initialTask);
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Safety check
  if (!task || !task.id) {
    return <div className="text-center py-12 text-gray-500">Task not found</div>;
  }

  const fetchTaskUpdate = async () => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      });
      
      if (response.ok) {
        const data = await response.json();
        const updatedTask = data.data;
        
        // Check if there are changes
        const hasNewChanges = (updatedTask.codeChanges?.length || 0) !== (task.codeChanges?.length || 0);
        const jobStatusChanged = updatedTask.claudeJobs?.[0]?.status !== task.claudeJobs?.[0]?.status;
        
        if (hasNewChanges || jobStatusChanged) {
          setTask(updatedTask);
          setLastUpdated(new Date().toISOString());
        }
        
        return updatedTask;
      } else {
        console.error('Failed to fetch task update:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching task update:', error);
    }
    return null;
  };

  // Simple polling logic
  useEffect(() => {
    if (!task?.id) return;
    
    const latestJob = task.claudeJobs?.[0];
    const shouldPoll = latestJob && (latestJob.status === 'processing' || latestJob.status === 'pending');
    
    if (shouldPoll && !isPolling) {
      setIsPolling(true);
      
      intervalRef.current = setInterval(async () => {
        const updatedTask = await fetchTaskUpdate();
        
        // Stop polling if job is complete or failed
        if (updatedTask?.claudeJobs?.[0]) {
          const status = updatedTask.claudeJobs[0].status;
          if (status === 'completed' || status === 'failed') {
            setIsPolling(false);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        }
      }, 3000);
    } else if (!shouldPoll && isPolling) {
      setIsPolling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [task?.claudeJobs?.[0]?.status, task?.id]); // Only depend on status and task ID

  const latestJob = task?.claudeJobs?.[0];

  return (
    <>
      {/* Task Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{task.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <GitBranch className="w-4 h-4" />
                {task.repository} / {task.branch}
              </span>
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                {task.author.name || task.author.email}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Created {formatDistanceToNow(new Date(task.createdAt))} ago
              </span>
              {isPolling && (
                <span className="flex items-center gap-1 text-blue-600">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="text-xs">Live updates</span>
                </span>
              )}
            </div>
          </div>
          <TaskActions 
            task={task} 
            onTaskUpdate={async () => {
              // Force an immediate update when actions are taken
              // Add small delay to ensure database is updated
              setTimeout(async () => {
                await fetchTaskUpdate();
              }, 1000);
            }}
          />
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-gray-700">{task.description}</p>
        </div>

        {latestJob && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Claude Response</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  latestJob.status === 'completed' ? 'bg-green-100 text-green-700' :
                  latestJob.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                  latestJob.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {latestJob.status}
                </span>
                {latestJob.status === 'processing' && (
                  <RefreshCw className="w-3 h-3 animate-spin text-yellow-600" />
                )}
              </div>
            </div>
            {latestJob.response && (
              <p className="text-sm text-gray-600">{latestJob.response}</p>
            )}
            {latestJob.error && (
              <p className="text-sm text-red-600">Error: {latestJob.error}</p>
            )}
            <div className="text-xs text-gray-400 mt-2">
              Last updated: {formatDistanceToNow(new Date(lastUpdated))} ago
            </div>
          </div>
        )}
      </div>

      {/* Repository Index Status */}
      <div className="mb-6">
        <RepositoryIndexStatus repository={task.repository} />
      </div>

      {/* Code Changes */}
      {(task.codeChanges?.length || 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Generated Code Changes ({task.codeChanges?.length || 0} files)
            </h2>
            <div className="text-xs text-gray-500">
              Last updated: {formatDistanceToNow(new Date(lastUpdated))} ago
            </div>
          </div>
          <CodeDiffViewer changes={task.codeChanges || []} />
        </div>
      )}

      {/* No changes yet - processing */}
      {(task.codeChanges?.length || 0) === 0 && latestJob?.status === 'processing' && (
        <div className="text-center py-12 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <div>
              <p className="text-blue-800 font-medium mb-1">Generating code...</p>
              <p className="text-sm text-blue-600">This may take a few moments. Updates will appear automatically.</p>
            </div>
          </div>
        </div>
      )}

      {/* No changes yet - pending */}
      {(task.codeChanges?.length || 0) === 0 && latestJob?.status === 'pending' && (
        <div className="text-center py-12 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <Clock className="w-8 h-8 text-yellow-600" />
            <div>
              <p className="text-yellow-800 font-medium mb-1">Code generation queued</p>
              <p className="text-sm text-yellow-600">Waiting to start generation. Updates will appear automatically.</p>
            </div>
          </div>
        </div>
      )}

      {/* No changes yet - failed */}
      {(task.codeChanges?.length || 0) === 0 && latestJob?.status === 'failed' && (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-lg">
          <div>
            <p className="text-red-800 font-medium mb-1">Code generation failed</p>
            <p className="text-sm text-red-600">Try regenerating the code using the regenerate button above.</p>
          </div>
        </div>
      )}

      {/* No changes and no job */}
      {(task.codeChanges?.length || 0) === 0 && !latestJob && (
        <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-600">No code changes generated yet</p>
        </div>
      )}
    </>
  );
}