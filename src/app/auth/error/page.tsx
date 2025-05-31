'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FiAlertCircle } from 'react-icons/fi';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-500 flex items-center justify-center">
            <FiAlertCircle className="h-12 w-12" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-white">Authentication Error</h2>
          <p className="mt-2 text-gray-400">
            There was a problem signing you in.
          </p>
        </div>
        
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-md">
            <p className="text-sm text-red-400">
              {decodeURIComponent(error)}
            </p>
          </div>
        )}
        
        <div className="mt-8 space-y-3">
          <Link
            href="/auth/signin"
            className="w-full flex justify-center px-4 py-3 border border-gray-700 rounded-md shadow-sm text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
          >
            Try Again
          </Link>
          
          <Link
            href="/"
            className="w-full flex justify-center px-4 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}