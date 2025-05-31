'use client';

import { useState } from 'react';
import { Task } from '@/types';
import { TaskItem } from './TaskItem';

interface TaskTabsProps {
  tasks: Task[];
  archivedTasks: Task[];
}

export function TaskTabs({ tasks, archivedTasks }: TaskTabsProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'archive'>('tasks');

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'tasks'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'archive'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Archive
          </button>
        </nav>
      </div>

      <div className="space-y-3">
        {activeTab === 'tasks' ? (
          tasks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No active tasks</p>
          ) : (
            tasks.map((task) => <TaskItem key={task.id} task={task} />)
          )
        ) : (
          archivedTasks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No archived tasks</p>
          ) : (
            archivedTasks.map((task) => <TaskItem key={task.id} task={task} />)
          )
        )}
      </div>
    </div>
  );
}