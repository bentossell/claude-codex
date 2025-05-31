'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, FileText } from 'lucide-react';

interface IndexStats {
  id: number;
  name: string;
  lastCommitHash: string;
  lastIndexed: string;
  totalFiles: number;
  fileBreakdown: Array<{
    fileType: string;
    count: number;
  }>;
}

interface RepositoryIndexStatusProps {
  repository: string;
}

export function RepositoryIndexStatus({ repository }: RepositoryIndexStatusProps) {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/index?repository=${encodeURIComponent(repository)}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      } else {
        setStats(null);
      }
    } catch (error) {
      console.error('Error fetching index stats:', error);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const reindex = async (force = false) => {
    setIndexing(true);
    try {
      const response = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository, force })
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.data);
      } else {
        const error = await response.json();
        alert(`Failed to reindex: ${error.error}`);
      }
    } catch (error) {
      console.error('Error reindexing:', error);
      alert('Failed to reindex repository');
    } finally {
      setIndexing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [repository]);

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm text-gray-600">Loading index status...</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">Repository not indexed</span>
          </div>
          <Button
            size="sm"
            onClick={() => reindex(false)}
            disabled={indexing}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {indexing ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Indexing...
              </>
            ) : (
              <>
                <Database className="h-3 w-3 mr-1" />
                Index Now
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">Repository Indexed</span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => reindex(false)}
            disabled={indexing}
          >
            {indexing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => reindex(true)}
            disabled={indexing}
          >
            Force Reindex
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-xs text-green-700">
        <div>
          <div className="font-medium">Total Files</div>
          <div>{stats.totalFiles}</div>
        </div>
        <div>
          <div className="font-medium">Last Updated</div>
          <div>{formatDate(stats.lastIndexed)}</div>
        </div>
      </div>

      {stats.fileBreakdown && stats.fileBreakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-200">
          <div className="text-xs font-medium text-green-800 mb-2">File Types</div>
          <div className="flex flex-wrap gap-2">
            {stats.fileBreakdown.map(({ fileType, count }) => (
              <span
                key={fileType}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs"
              >
                <FileText className="h-3 w-3" />
                {fileType}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}