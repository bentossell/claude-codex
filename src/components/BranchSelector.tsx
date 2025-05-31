'use client';

import { useState, useEffect } from 'react';
import { GitBranch } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BranchSelectorProps {
  repository: string;
  value: string;
  onChange: (value: string) => void;
}

export function BranchSelector({ repository, value, onChange }: BranchSelectorProps) {
  const [branches, setBranches] = useState<string[]>(['main']);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repository) return;

    const fetchBranches = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/repositories/${encodeURIComponent(repository)}/branches`);
        if (response.ok) {
          const data = await response.json();
          setBranches(data.branches || ['main']);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
  }, [repository]);

  return (
    <Select value={value} onValueChange={onChange} disabled={!repository || loading}>
      <SelectTrigger className="w-[140px] h-9 bg-gray-50 border-gray-300 text-sm">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-gray-500" />
          <SelectValue placeholder="Branch" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {branches.map((branch) => (
          <SelectItem key={branch} value={branch}>
            {branch}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}