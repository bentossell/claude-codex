'use client';

import { signIn } from 'next-auth/react';
import { FiGithub } from 'react-icons/fi';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">Sign in to Codex</h2>
          <p className="mt-2 text-gray-400">
            Use your GitHub account to get started
          </p>
        </div>
        
        <div className="mt-8">
          <button
            onClick={() => signIn('github', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-700 rounded-md shadow-sm text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
          >
            <FiGithub className="w-5 h-5 mr-3" />
            Sign in with GitHub
          </button>
        </div>
        
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-950 text-gray-400">
                By signing in, you agree to our terms and privacy policy
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}