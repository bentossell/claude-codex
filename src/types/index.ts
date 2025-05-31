export interface Task {
  id: string;
  title: string;
  description: string;
  repository: string;
  branch: string;
  status: TaskStatus;
  author: User;
  authorId: string;
  codeChanges?: CodeChange[];
  metrics?: TaskMetrics | null | any;
  pullRequestUrl?: string | null;
  pullRequestNumber?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  githubId?: string | null;
}

export interface CodeChange {
  id: string;
  taskId: string;
  filePath: string;
  action: 'create' | 'modify' | 'delete' | string;
  previousContent?: string | null;
  newContent: string;
  diff: string;
  approved: boolean;
  appliedAt?: Date | null;
  createdAt: Date;
}

export interface ClaudeContext {
  taskId: string;
  prompt: string;
  response?: string;
  model: string;
  tokensUsed?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  generatedAt: Date;
}

export interface TaskMetrics {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'REVIEWING' | 'COMPLETED' | 'MERGED' | 'ARCHIVED';

export interface Repository {
  name: string;
  owner: string;
  defaultBranch: string;
  branches: string[];
}

export interface CreateTaskInput {
  title: string;
  description: string;
  repository: string;
  branch: string;
}

export interface GenerateCodeInput {
  taskId: string;
  additionalContext?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}