'use client';

import { useState } from 'react';
import { CodeChange } from '@/types';
import { File, FilePlus, FileMinus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeDiffViewerProps {
  changes: CodeChange[];
}

export function CodeDiffViewer({ changes }: CodeDiffViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string>(changes[0]?.id || '');
  const [approvedFiles, setApprovedFiles] = useState<Set<string>>(new Set());

  const selectedChange = changes.find(c => c.id === selectedFile);

  const getFileIcon = (action: string) => {
    switch (action) {
      case 'create':
        return <FilePlus className="w-4 h-4 text-green-600" />;
      case 'modify':
        return <File className="w-4 h-4 text-yellow-600" />;
      case 'delete':
        return <FileMinus className="w-4 h-4 text-red-600" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  const toggleApproval = (changeId: string) => {
    const newApproved = new Set(approvedFiles);
    if (newApproved.has(changeId)) {
      newApproved.delete(changeId);
    } else {
      newApproved.add(changeId);
    }
    setApprovedFiles(newApproved);
  };

  const renderDiff = (diff: string) => {
    const lines = diff.split('\n');
    return lines.map((line, index) => {
      let className = 'font-mono text-sm whitespace-pre';
      if (line.startsWith('+')) {
        className += ' bg-green-50 text-green-700';
      } else if (line.startsWith('-')) {
        className += ' bg-red-50 text-red-700';
      } else if (line.startsWith('@@')) {
        className += ' bg-blue-50 text-blue-700';
      } else {
        className += ' text-gray-600';
      }
      
      return (
        <div key={index} className={className}>
          {line}
        </div>
      );
    });
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* File list */}
      <div className="col-span-1 bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Files Changed</h3>
        <div className="space-y-1">
          {changes.map((change) => (
            <button
              key={change.id}
              onClick={() => setSelectedFile(change.id)}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                selectedFile === change.id
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                {getFileIcon(change.action)}
                <span className="text-sm truncate">{change.filePath}</span>
              </div>
              {approvedFiles.has(change.id) && (
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="col-span-3 bg-white border border-gray-200 rounded-lg">
        {selectedChange && (
          <>
            <div className="border-b border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getFileIcon(selectedChange.action)}
                <h3 className="text-gray-900 font-medium">{selectedChange.filePath}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  selectedChange.action === 'create' ? 'bg-green-100 text-green-700' :
                  selectedChange.action === 'modify' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedChange.action}
                </span>
              </div>
              <Button
                onClick={() => toggleApproval(selectedChange.id)}
                size="sm"
                variant={approvedFiles.has(selectedChange.id) ? "default" : "outline"}
                className={approvedFiles.has(selectedChange.id) ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {approvedFiles.has(selectedChange.id) ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Approved
                  </>
                ) : (
                  'Approve'
                )}
              </Button>
            </div>
            
            <div className="p-4 overflow-x-auto bg-gray-50">
              <div className="min-w-0">
                {renderDiff(selectedChange.diff)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}