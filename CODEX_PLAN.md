# Codex Implementation Plan

## Overview
Transform the Claude Code wrapper into a full-stack task management system that uses Claude to generate code from natural language descriptions.

## Architecture Decision
Instead of using the Claude Code CLI wrapper, we'll integrate directly with the Anthropic SDK for better control and efficiency. The wrapper code will be adapted for the backend services.

## Phase 1: Core Setup (Current)
- [x] Initialize Next.js project with TypeScript and Tailwind
- [ ] Set up database (PostgreSQL with Prisma)
- [ ] Configure authentication (NextAuth with GitHub)
- [ ] Create base UI components
- [ ] Set up API structure

## Phase 2: Task Management
- [ ] Task CRUD operations
- [ ] Task list UI (GitHub-style)
- [ ] Task detail view
- [ ] Repository integration
- [ ] Branch selection

## Phase 3: Claude Integration
- [ ] Adapt Claude Code wrapper for server-side use
- [ ] Code generation endpoint
- [ ] Context retrieval from repositories
- [ ] Streaming response handling
- [ ] Code diff generation

## Phase 4: Code Preview & Application
- [ ] Diff viewer component
- [ ] File-by-file change review
- [ ] Code modification UI
- [ ] Git operations (commit, branch, PR)

## Phase 5: Enhanced Features
- [ ] Repository context analysis
- [ ] Code pattern matching
- [ ] Test generation
- [ ] Documentation generation

## Tech Stack
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma
- **Auth**: NextAuth.js
- **AI**: Anthropic SDK (direct integration)
- **Git**: Simple-git library
- **Queue**: Bull with Redis (later)

## Key Differences from Original Wrapper
1. Server-side execution instead of CLI
2. Direct Anthropic SDK usage for better control
3. Integrated git operations
4. Database persistence
5. Multi-user support with auth