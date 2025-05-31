'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BranchSelector } from './BranchSelector';

interface Repository {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  default_branch: string;
  private: boolean;
  description?: string;
}

export function CreateTaskSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [actionType, setActionType] = useState<'ask' | 'code'>('code');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    repository: '',
    branch: 'main'
  });

  useEffect(() => {
    fetchRepositories();
  }, []);

  const fetchRepositories = async () => {
    try {
      const response = await fetch('/api/github/repos');
      const data = await response.json();
      if (data.success) {
        setRepositories(data.data);
        // Auto-select first repository
        if (data.data.length > 0) {
          setFormData(prev => ({
            ...prev,
            repository: data.data[0].full_name,
            branch: data.data[0].default_branch
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching repositories:', error);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) return;
    
    setLoading(true);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.description.slice(0, 100),
          description: formData.description,
          repository: formData.repository,
          branch: formData.branch,
          generateCode: actionType === 'code'
        })
      });

      if (!response.ok) throw new Error('Failed to create task');
      
      const data = await response.json();
      router.push(`/tasks/${data.data.id}`);
      router.refresh();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold text-gray-900">
        What are we coding next?
      </h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          placeholder="Describe a task"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-3 text-base border-gray-200 focus:border-gray-400 focus:ring-0"
        />
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2 flex-1">
            <Select
              value={formData.repository}
              onValueChange={(value) => {
                const repo = repositories.find(r => r.full_name === value);
                setFormData({ 
                  ...formData, 
                  repository: value,
                  branch: repo?.default_branch || 'main'
                });
              }}
            >
              <SelectTrigger className="w-full bg-white border-gray-200 focus:border-gray-400 focus:ring-0">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-gray-500" />
                  <SelectValue placeholder="Select repository" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {loadingRepos ? (
                  <div className="py-2 px-3 text-sm text-gray-500">Loading...</div>
                ) : repositories.length === 0 ? (
                  <div className="py-2 px-3 text-sm text-gray-500">No repositories found</div>
                ) : (
                  repositories.map((repo) => (
                    <SelectItem key={repo.id} value={repo.full_name}>
                      {repo.full_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <BranchSelector
              repository={formData.repository}
              value={formData.branch}
              onChange={(value) => setFormData({ ...formData, branch: value })}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="outline"
              disabled={loading || !formData.description.trim() || !formData.repository}
              onClick={() => setActionType('ask')}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Ask
            </Button>
            
            <Button
              type="submit"
              disabled={loading || !formData.description.trim() || !formData.repository}
              onClick={() => setActionType('code')}
              className="bg-gray-900 text-white hover:bg-gray-800"
            >
              Code
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}