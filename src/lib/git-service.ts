import simpleGit, { SimpleGit } from 'simple-git';
import { CodeChange } from '@/types';
import fs from 'fs/promises';
import path from 'path';

export interface RepositoryContext {
  structure: string[];
  packageJson?: any;
  readme?: string;
  mainFiles?: { [key: string]: string };
}

export class GitService {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async cloneRepository(repoUrl: string, branch: string): Promise<void> {
    await this.git.clone(repoUrl, this.repoPath);
    await this.git.checkout(branch);
  }

  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
  }

  async applyChanges(changes: CodeChange[]): Promise<void> {
    for (const change of changes) {
      const filePath = path.join(this.repoPath, change.filePath);
      
      switch (change.action) {
        case 'create':
        case 'modify':
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, change.newContent);
          await this.git.add(change.filePath);
          break;
        case 'delete':
          await fs.unlink(filePath);
          await this.git.rm(change.filePath);
          break;
      }
    }
  }

  async commit(message: string): Promise<string> {
    await this.git.commit(message);
    const log = await this.git.log({ n: 1 });
    return log.latest?.hash || '';
  }

  async push(branch: string): Promise<void> {
    await this.git.push('origin', branch);
  }

  async getFileContent(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(path.join(this.repoPath, filePath), 'utf-8');
      return content;
    } catch (error) {
      return null;
    }
  }

  async getDiff(filePath: string, newContent: string): Promise<string> {
    const currentContent = await this.getFileContent(filePath) || '';
    // Simple diff implementation - in production, use a proper diff library
    return this.createSimpleDiff(filePath, currentContent, newContent);
  }

  private createSimpleDiff(filePath: string, oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;
    
    // Very simple diff - just show all lines
    // In production, use a proper diff algorithm
    diff += '@@ -1,' + oldLines.length + ' +1,' + newLines.length + ' @@\n';
    
    oldLines.forEach(line => diff += `-${line}\n`);
    newLines.forEach(line => diff += `+${line}\n`);
    
    return diff;
  }
}

export async function getRepositoryContext(repository: string, branch: string, taskDescription?: string): Promise<RepositoryContext> {
  console.log('🧠 Getting intelligent repository context for:', repository);
  
  try {
    const { codebaseIndex } = await import('./codebase-index');
    const { advancedCodebaseIndex } = await import('./advanced-codebase-index');
    
    // CRITICAL: Force database initialization before any operations
    console.log('🔧 Ensuring database initialization...');
    await codebaseIndex.initialize();
    
    // Check if we need to update the index
    const needsUpdate = await codebaseIndex.needsUpdate(repository, branch);
    
    if (needsUpdate) {
      console.log('📚 Repository index outdated, updating with advanced indexing...');
      // Use both indexing systems
      await codebaseIndex.indexRepository(repository, branch);
      await advancedCodebaseIndex.indexRepository(repository, branch);
    } else {
      console.log('✅ Using cached repository index');
    }
    
    // Get semantically relevant files using advanced search
    console.log('🔍 Advanced search parameters:', { repository, taskDescription, limit: 15 });
    
    // Get semantically relevant files for the task
    const relevantFiles = taskDescription ? 
      await codebaseIndex.searchRelevantFiles(repository, taskDescription, 15) :
      await codebaseIndex.searchRelevantFiles(repository, 'general development', 10);
    
    console.log(`🎯 Found ${relevantFiles.length} relevant files for task: "${taskDescription}"`);
    relevantFiles.forEach(result => {
      console.log(`  - ${result.file.path} (${result.file.fileType}, score: ${result.score.toFixed(2)}, ${result.reason})`);
    });
    
    // Debug: show which files contain the target text
    if (taskDescription.toLowerCase().includes('ben tossell')) {
      console.log('\n🔍 Debug - Files containing "ben tossell":');
      const allFiles = await codebaseIndex.getAllFiles(repository);
      allFiles.forEach(file => {
        if (file.content.toLowerCase().includes('ben tossell')) {
          console.log(`  ✅ ${file.path} - contains "ben tossell"`);
        }
      });
    }
    
    // Build context from relevant files
    const mainFiles: { [key: string]: string } = {};
    const structure: string[] = [];
    let packageJson = null;
    
    relevantFiles.forEach(result => {
      const file = result.file;
      mainFiles[file.path] = file.content;
      
      // Extract directory structure
      const dirs = file.path.split('/').slice(0, -1);
      dirs.forEach((dir, index) => {
        const dirPath = dirs.slice(0, index + 1).join('/') + '/';
        if (!structure.includes(dirPath)) {
          structure.push(dirPath);
        }
      });
      
      // Extract package.json
      if (file.path === 'package.json') {
        try {
          packageJson = JSON.parse(file.content);
        } catch (error) {
          console.warn('Could not parse package.json');
        }
      }
    });
    
    // Get repository stats for summary
    const stats = await codebaseIndex.getRepositoryStats(repository);
    const summary = `${repository} - ${stats?.totalFiles || 0} files indexed, last updated ${stats?.lastIndexed || 'unknown'}`;
    
    console.log(`✅ Smart context ready: ${Object.keys(mainFiles).length} relevant files selected`);
    console.log('🔍 DEBUG: Final mainFiles being sent to Claude:');
    Object.keys(mainFiles).forEach(path => {
      console.log(`  📄 ${path} (${mainFiles[path].length} chars)`);
    });

    return {
      structure: structure.sort(),
      packageJson,
      readme: summary,
      mainFiles
    };
    
  } catch (error) {
    console.error('❌ Error with intelligent indexing, attempting direct database recovery:', error);
    
    try {
      // CRITICAL: Don't give up completely - try to get files directly from database
      console.log('🔧 Attempting direct database file retrieval...');
      
      const { codebaseIndex } = await import('./codebase-index');
      await codebaseIndex.initialize(); // Force initialization
      
      // Get all files directly from database as last resort
      const allFiles = await codebaseIndex.getAllFiles(repository);
      console.log(`🔧 Direct retrieval found ${allFiles.length} files`);
      
      const recoveryFiles: { [key: string]: string } = {};
      
      // Prioritize HTML files first, then important files
      const priorityOrder = [
        (f: any) => f.path === 'index.html',
        (f: any) => f.path.endsWith('.html'),
        (f: any) => f.path.includes('ben tossell') || f.path.includes('Ben Tossell'),
        (f: any) => f.fileType === 'page',
        (f: any) => f.path === 'package.json' || f.path === 'README.md'
      ];
      
      // Add files in priority order, up to 10 files
      for (const priorityFn of priorityOrder) {
        const matchingFiles = allFiles.filter(priorityFn);
        for (const file of matchingFiles.slice(0, 10 - Object.keys(recoveryFiles).length)) {
          recoveryFiles[file.path] = file.content;
          console.log(`🔧 Added priority file: ${file.path}`);
        }
        if (Object.keys(recoveryFiles).length >= 10) break;
      }
      
      // If still no files, add any files we can find
      if (Object.keys(recoveryFiles).length === 0) {
        for (const file of allFiles.slice(0, 5)) {
          recoveryFiles[file.path] = file.content;
          console.log(`🔧 Added fallback file: ${file.path}`);
        }
      }
      
      console.log(`🔧 Recovery successful: ${Object.keys(recoveryFiles).length} files retrieved`);
      
      return {
        structure: ['./'],
        packageJson: recoveryFiles['package.json'] ? JSON.parse(recoveryFiles['package.json']) : undefined,
        readme: `${repository} - Recovery mode: ${Object.keys(recoveryFiles).length} files found`,
        mainFiles: recoveryFiles
      };
      
    } catch (recoveryError) {
      console.error('❌ Recovery also failed, using absolute minimal context:', recoveryError);
      
      // Absolute last resort - but at least try to indicate the problem clearly
      return {
        structure: [],
        packageJson: undefined,
        readme: `${repository} - Unable to access repository files. Please check indexing.`,
        mainFiles: {
          'error.txt': `Unable to access repository files for ${repository}. The indexing system may need reinitialization. Task: ${taskDescription}`
        }
      };
    }
  }
}

// Helper functions for advanced search integration
async function convertAdvancedResults(advancedResults: any[], repository: string): Promise<any[]> {
  // Convert advanced search results to the format expected by the rest of the system
  const convertedResults = [];
  
  for (const result of advancedResults) {
    // Group chunks by file to create file-level results
    const fileResults = new Map<string, any>();
    
    if (result.chunk && result.chunk.file) {
      const filePath = result.chunk.file;
      
      if (!fileResults.has(filePath)) {
        fileResults.set(filePath, {
          file: {
            path: filePath,
            content: result.chunk.content,
            contentHash: '', // Could compute if needed
            size: result.chunk.content.length,
            lastModified: new Date().toISOString(),
            fileType: mapLanguageToFileType(result.chunk.language),
            imports: [],
            exports: []
          },
          score: result.fusedScore,
          reason: result.reason
        });
      } else {
        // Merge content if same file has multiple chunks
        const existing = fileResults.get(filePath);
        existing.file.content += '\n' + result.chunk.content;
        existing.score = Math.max(existing.score, result.fusedScore);
      }
    }
    
    convertedResults.push(...fileResults.values());
  }
  
  return convertedResults;
}

function mapLanguageToFileType(language: string): string {
  const mapping: { [key: string]: string } = {
    'html': 'page',
    'javascript': 'script',
    'typescript': 'script',
    'css': 'style',
    'markdown': 'documentation',
    'json': 'config'
  };
  return mapping[language] || 'unknown';
}