import { execSync } from 'child_process';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import simpleGit from 'simple-git';

export interface RepoIndex {
  files: Array<{
    path: string;
    content: string;
    size: number;
  }>;
  structure: string[];
  techStack: {
    framework: string;
    language: string;
    styling: string;
    database?: string;
    auth?: string;
  };
  summary: string;
}

export class RepomixService {
  private tempDir: string;

  constructor() {
    this.tempDir = join(tmpdir(), 'repomix-repos');
  }

  async getRepoIndex(repository: string, branch: string = 'main'): Promise<RepoIndex> {
    const repoPath = join(this.tempDir, repository.replace('/', '-'));
    
    try {
      console.log('📥 Cloning repository for analysis...');
      
      // Clean up any existing clone
      if (existsSync(repoPath)) {
        rmSync(repoPath, { recursive: true, force: true });
      }

      // Clone the repository
      const git = simpleGit();
      await git.clone(`https://github.com/${repository}.git`, repoPath, ['--depth', '1', '--branch', branch]);
      
      console.log('🔍 Running repomix analysis...');
      
      // Create repomix config for optimal LLM context
      const configPath = join(repoPath, 'repomix.config.json');
      const config = {
        output: {
          filePath: join(repoPath, 'repo-index.xml'),
          style: 'xml',
          removeComments: false,
          removeEmptyLines: false,
          topFilesLength: 5,
          showLineNumbers: true
        },
        include: [
          '**/*.{ts,tsx,js,jsx,json,md,yaml,yml}',
          '**/package.json',
          '**/tsconfig.json',
          '**/next.config.*',
          '**/tailwind.config.*',
          '**/prisma/schema.prisma',
          '**/.env.example'
        ],
        ignore: {
          useGitignore: true,
          useDefaultPatterns: true,
          customPatterns: [
            'node_modules/**',
            '.next/**',
            'dist/**',
            'build/**',
            '**/*.log',
            '**/.env',
            '**/.env.local',
            '**/coverage/**',
            '**/*.test.{ts,tsx,js,jsx}',
            '**/*.spec.{ts,tsx,js,jsx}',
            '**/test/**',
            '**/tests/**',
            '**/__tests__/**'
          ]
        },
        security: {
          enableSecurityCheck: true
        }
      };
      
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      // Run repomix
      const repomixPath = join(process.cwd(), 'node_modules/.bin/repomix');
      execSync(`cd "${repoPath}" && "${repomixPath}" --config repomix.config.json`, { 
        stdio: 'pipe',
        timeout: 60000 // 1 minute timeout
      });
      
      console.log('📖 Processing repomix output...');
      
      // Read the generated XML
      const xmlContent = readFileSync(join(repoPath, 'repo-index.xml'), 'utf-8');
      
      // Parse the XML to extract useful information
      const repoIndex = this.parseRepomixOutput(xmlContent, repository);
      
      console.log('✅ Repository index generated successfully');
      
      // Cleanup
      rmSync(repoPath, { recursive: true, force: true });
      
      return repoIndex;
      
    } catch (error) {
      console.error('❌ Error generating repo index:', error);
      
      // Cleanup on error
      if (existsSync(repoPath)) {
        rmSync(repoPath, { recursive: true, force: true });
      }
      
      throw new Error(`Failed to generate repository index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseRepomixOutput(xmlContent: string, repository: string): RepoIndex {
    const files: Array<{ path: string; content: string; size: number }> = [];
    const structure: string[] = [];
    
    // Extract files from XML using regex (simple parsing)
    const fileRegex = /<file path="([^"]+)"[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/file>/g;
    let match;
    
    while ((match = fileRegex.exec(xmlContent)) !== null) {
      const [, path, content] = match;
      files.push({
        path: path.trim(),
        content: content.trim(),
        size: content.length
      });
      
      // Build structure
      const dirs = path.split('/').slice(0, -1);
      dirs.forEach((dir, index) => {
        const dirPath = dirs.slice(0, index + 1).join('/') + '/';
        if (!structure.includes(dirPath)) {
          structure.push(dirPath);
        }
      });
    }
    
    // Analyze tech stack from package.json
    const packageJsonFile = files.find(f => f.path === 'package.json');
    let techStack = {
      framework: 'Unknown',
      language: 'JavaScript',
      styling: 'CSS',
      database: undefined as string | undefined,
      auth: undefined as string | undefined
    };
    
    if (packageJsonFile) {
      try {
        const packageJson = JSON.parse(packageJsonFile.content);
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Framework
        if (deps.next) techStack.framework = 'Next.js';
        else if (deps.react) techStack.framework = 'React';
        
        // Language
        if (deps.typescript) techStack.language = 'TypeScript';
        
        // Styling
        if (deps.tailwindcss) techStack.styling = 'Tailwind CSS';
        else if (deps['styled-components']) techStack.styling = 'Styled Components';
        
        // Database
        if (deps.prisma) techStack.database = 'Prisma';
        else if (deps.mongoose) techStack.database = 'MongoDB';
        
        // Auth
        if (deps['next-auth']) techStack.auth = 'NextAuth.js';
        
      } catch (error) {
        console.log('Could not parse package.json for tech stack analysis');
      }
    }
    
    // Generate summary
    const summary = `${repository} - ${techStack.framework} app with ${files.length} files`;
    
    return {
      files: files.slice(0, 50), // Limit to prevent overwhelming Claude
      structure: structure.sort(),
      techStack,
      summary
    };
  }

  // Get focused context for a specific task
  getTaskRelevantFiles(repoIndex: RepoIndex, taskDescription: string): RepoIndex {
    const taskLower = taskDescription.toLowerCase();
    const relevantFiles: typeof repoIndex.files = [];
    
    // Always include essential files
    const essentialPatterns = [
      /package\.json$/,
      /tsconfig\.json$/,
      /next\.config\./,
      /tailwind\.config\./,
      /src\/app\/layout\.tsx$/,
      /src\/lib\/utils\.ts$/,
      /src\/types\//,
      /prisma\/schema\.prisma$/
    ];
    
    // Add task-specific patterns
    const taskPatterns: RegExp[] = [];
    
    if (taskLower.includes('component') || taskLower.includes('ui')) {
      taskPatterns.push(/\/components\//);
    }
    if (taskLower.includes('page') || taskLower.includes('route')) {
      taskPatterns.push(/\/app\/.*\/page\.tsx$/, /\/pages\//);
    }
    if (taskLower.includes('api') || taskLower.includes('endpoint')) {
      taskPatterns.push(/\/api\//, /route\.ts$/);
    }
    if (taskLower.includes('auth') || taskLower.includes('login') || taskLower.includes('signin')) {
      taskPatterns.push(/auth/, /login/, /signin/);
    }
    if (taskLower.includes('database') || taskLower.includes('db') || taskLower.includes('model')) {
      taskPatterns.push(/prisma/, /models?/, /schema/);
    }
    
    // Find relevant files
    for (const file of repoIndex.files) {
      const isEssential = essentialPatterns.some(pattern => pattern.test(file.path));
      const isTaskRelevant = taskPatterns.some(pattern => pattern.test(file.path));
      
      if (isEssential || isTaskRelevant) {
        relevantFiles.push(file);
      }
    }
    
    console.log(`🎯 Found ${relevantFiles.length} relevant files for task`);
    
    return {
      ...repoIndex,
      files: relevantFiles.slice(0, 20) // Limit to prevent overwhelming Claude
    };
  }
}

export const repomixService = new RepomixService();