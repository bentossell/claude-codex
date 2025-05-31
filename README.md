# Codex - AI-Powered Code Task Management

Codex is a task management system that leverages Claude AI to transform natural language task descriptions into executable code changes. It provides a GitHub-style interface for managing coding tasks while using Claude's capabilities to generate, review, and implement code modifications.

## Features

- 🤖 **AI-Powered Code Generation**: Describe what you want to build in natural language
- 📝 **Task Management**: GitHub-style interface for tracking coding tasks
- 🔍 **Code Preview**: Review AI-generated code with diff viewer before applying
- 🔄 **Git Integration**: Automatic branch creation and commit management
- 🎯 **Context-Aware**: Claude understands your repository structure and patterns
- 🌙 **Dark Theme**: Beautiful GitHub-inspired UI

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- GitHub account (for authentication)
- Anthropic API key

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/codex.git
   cd codex
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add:
   - `DATABASE_URL`: PostgreSQL connection string
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`: From GitHub OAuth App
   - `ANTHROPIC_API_KEY`: Your Claude API key
   - `GITHUB_ACCESS_TOKEN`: Personal access token with `repo` scope (for creating PRs)

4. **Create GitHub Personal Access Token**
   - Go to GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
   - Generate new token with `repo` scope (full control of private repositories)
   - Copy the token and add it as `GITHUB_ACCESS_TOKEN` in your `.env` file

5. **Create GitHub OAuth App**
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Create new OAuth App with:
     - Homepage URL: `http://localhost:3000`
     - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

6. **Set up database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

7. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Sign in** with your GitHub account
2. **Create a task** by describing what you want to build
3. **Choose action**:
   - "Ask Claude" for exploration and clarification
   - "Generate Code" for implementation
4. **Review** the generated code changes
5. **Apply** changes to your repository

## Architecture

- **Frontend**: Next.js 15 with TypeScript and Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with GitHub OAuth
- **AI**: Anthropic Claude API
- **UI**: GitHub-inspired dark theme

## Project Structure

```
codex/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/             # Utilities and services
│   └── types/           # TypeScript types
├── prisma/              # Database schema
└── public/              # Static assets
```

## Key Components

- **Task Management**: Create, view, and manage coding tasks
- **Code Generation**: Claude analyzes tasks and generates implementation
- **Diff Viewer**: Review changes before applying
- **Session Management**: Maintains context across interactions
- **Git Operations**: Automated branch and commit management

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Run type checking
npm run type-check
```

## Future Enhancements

- Direct Git push integration
- Multi-file change sets
- Team collaboration features
- Custom Claude fine-tuning
- IDE plugins
- CI/CD pipeline integration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT