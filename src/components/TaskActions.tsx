'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Task } from '@/types';
import { GitCommit, Archive, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TaskActionsProps {
  task: Task;
  onTaskUpdate?: () => Promise<void>;
}

export function TaskActions({ task, onTaskUpdate }: TaskActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleApplyChanges = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/apply`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to apply changes');
      }
      
      const data = await response.json();
      if (data.data?.pullRequestUrl) {
        window.open(data.data.pullRequestUrl, '_blank');
      }
      
      router.refresh();
    } catch (error) {
      console.error('Error applying changes:', error);
      let message = error instanceof Error ? error.message : 'Failed to apply changes';
      
      // Provide more helpful error messages for common issues
      if (message.includes('Resource not accessible by personal access token')) {
        message = 'GitHub token permissions insufficient. Please ensure your GitHub personal access token has "repo" scope permissions to create branches and pull requests.';
      }
      
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    console.log('🔄 Regenerate button clicked for task:', task.id);
    setLoading(true);
    try {
      console.log('📡 Sending regenerate request...');
      const response = await fetch(`/api/tasks/${task.id}/regenerate`, {
        method: 'POST'
      });
      
      console.log('📡 Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Regenerate failed:', errorData);
        throw new Error('Failed to regenerate');
      }
      
      const result = await response.json();
      console.log('✅ Regenerate success:', result);
      
      // Trigger immediate update if callback provided
      if (onTaskUpdate) {
        console.log('🔄 Triggering task update callback');
        await onTaskUpdate();
      } else {
        // Fallback to router refresh with delay
        console.log('🔄 Fallback to router refresh');
        setTimeout(() => {
          router.refresh();
        }, 500);
      }
    } catch (error) {
      console.error('❌ Error regenerating:', error);
      alert('Failed to regenerate code');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' })
      });
      
      if (!response.ok) throw new Error('Failed to archive');
      
      router.push('/');
    } catch (error) {
      console.error('Error archiving:', error);
      alert('Failed to archive task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {task.status === 'IN_PROGRESS' && (
        <Button
          onClick={handleApplyChanges}
          disabled={loading}
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <GitCommit className="w-4 h-4 mr-1" />
          Apply Changes
        </Button>
      )}
      
      <Button
        onClick={handleRegenerate}
        disabled={loading}
        size="sm"
        variant="outline"
        className="border-gray-300"
      >
        <RefreshCw className="w-4 h-4 mr-1" />
        Regenerate
      </Button>
      
      <Button
        onClick={handleArchive}
        disabled={loading}
        size="sm"
        variant="outline"
        className="border-gray-300"
      >
        <Archive className="w-4 h-4 mr-1" />
        Archive
      </Button>
    </div>
  );
}