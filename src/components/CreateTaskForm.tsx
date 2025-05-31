'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Folder, Sparkles, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Repository {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  default_branch: string;
  private: boolean;
  description?: string;
}

export function CreateTaskForm() {
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
      }
    } catch (error) {
      console.error('Error fetching repositories:', error);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          generateCode: actionType === 'code'
        })
      });

      if (!response.ok) throw new Error('Failed to create task');
      
      const data = await response.json();
      router.push(`/tasks/${data.data.id}`);
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const selectedRepo = repositories.find(r => r.full_name === formData.repository);

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Create New Task
        </CardTitle>
        <CardDescription>
          Describe what you want to build and let Claude implement it
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Add user authentication to the app"
              className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Task Description</Label>
            <Textarea
              id="description"
              required
              rows={6}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what you want to build in detail. Include specific requirements, technical constraints, and any relevant context..."
              className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-600 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="repository" className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                Repository
              </Label>
              <Select
                value={formData.repository}
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  repository: value,
                  branch: repositories.find(r => r.full_name === value)?.default_branch || 'main'
                })}
              >
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                  <SelectValue placeholder={loadingRepos ? "Loading repositories..." : "Select repository"} />
                </SelectTrigger>
                <SelectContent>
                  {loadingRepos ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : repositories.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2">No repositories found</div>
                  ) : (
                    repositories.map((repo) => (
                      <SelectItem key={repo.id} value={repo.full_name}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{repo.full_name}</span>
                          {repo.private && (
                            <span className="text-xs text-muted-foreground">(private)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Branch
              </Label>
              <Input
                id="branch"
                type="text"
                required
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                placeholder="main"
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-600"
              />
            </div>
          </div>

          {selectedRepo?.description && (
            <div className="text-xs text-muted-foreground bg-zinc-800/30 p-3 rounded-md">
              {selectedRepo.description}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              variant="outline"
              disabled={loading || !formData.repository}
              onClick={() => setActionType('ask')}
              className="flex-1"
            >
              {loading && actionType === 'ask' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              Ask Claude
            </Button>
            
            <Button
              type="submit"
              disabled={loading || !formData.repository}
              onClick={() => setActionType('code')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {loading && actionType === 'code' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Code
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}