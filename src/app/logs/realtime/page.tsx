'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function RealtimeLogsPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchLogs = async () => {
      try {
        const response = await fetch(`/api/logs?t=${Date.now()}`, {
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.logs && Array.isArray(data.logs)) {
          const formattedLogs = data.logs.map((log: any) => {
            try {
              const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A';
              const level = (log.level || 'LOG').toUpperCase().padEnd(5);
              const component = (log.component || '-').padEnd(20);
              return `[${time}] [${level}] [${component}] ${log.message || ''}`;
            } catch (e) {
              return JSON.stringify(log);
            }
          });
          setLogs(formattedLogs);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
        setIsConnected(false);
      }
    };

    // Initial fetch
    fetchLogs();
    setIsConnected(true);

    // Poll every second
    intervalId = setInterval(fetchLogs, 1000);

    return () => {
      clearInterval(intervalId);
      setIsConnected(false);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/logs" className="text-gray-400 hover:text-gray-200">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold">Realtime Logs</h1>
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm">
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">Waiting for logs...</div>
            ) : (
              logs.slice(-50).reverse().map((log, index) => (
                <div key={index} className="text-gray-300 hover:bg-gray-700 px-2 py-1 rounded">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}