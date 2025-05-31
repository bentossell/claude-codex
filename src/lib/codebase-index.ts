import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { pipeline } from '@xenova/transformers';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { tmpdir } from 'os';
import simpleGit from 'simple-git';

export interface IndexedFile {
  id?: number;
  path: string;
  content: string;
  contentHash: string;
  size: number;
  lastModified: string;
  fileType: string;
  embedding?: number[];
  imports?: string[];
  exports?: string[];
}

export interface RepoIndex {
  lastCommitHash: string;
  lastIndexed: string;
  files: IndexedFile[];
  totalFiles: number;
}

export interface SearchResult {
  file: IndexedFile;
  score: number;
  reason: string;
}

export class CodebaseIndexService {
  private db: Database | null = null;
  private embedder: any = null;
  private dbPath: string;

  constructor() {
    this.dbPath = join(process.cwd(), 'data', 'codebase-index.db');
  }

  async initialize() {
    console.log('🔍 DEBUG: Initialize called, current db status:', this.db ? 'exists' : 'null');
    
    if (this.db) {
      console.log('🔍 DEBUG: Database already initialized, skipping');
      return;
    }

    // Ensure data directory exists
    const dataDir = dirname(this.dbPath);
    console.log('🔍 DEBUG: Ensuring data directory exists:', dataDir);
    if (!existsSync(dataDir)) {
      execSync(`mkdir -p "${dataDir}"`);
    }

    // Initialize database
    console.log('🔍 DEBUG: Opening database at:', this.dbPath);
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
    console.log('🔍 DEBUG: Database opened successfully');

    // Create tables
    console.log('🔍 DEBUG: Creating tables...');
    await this.createTables();
    console.log('🔍 DEBUG: Tables created');

    // Initialize embedder (lightweight model for speed)
    console.log('🧠 Loading embedding model...');
    try {
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('✅ Embedding model ready');
    } catch (error) {
      console.warn('⚠️ Failed to load embedding model:', error);
      this.embedder = null;
    }
  }

  private async createTables() {
    await this.db!.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        lastCommitHash TEXT,
        lastIndexed TEXT,
        totalFiles INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY,
        repositoryId INTEGER,
        path TEXT NOT NULL,
        content TEXT,
        contentHash TEXT,
        size INTEGER,
        lastModified TEXT,
        fileType TEXT,
        embedding TEXT, -- JSON array of embedding vector
        imports TEXT,   -- JSON array of import paths
        exports TEXT,   -- JSON array of export names
        FOREIGN KEY (repositoryId) REFERENCES repositories (id),
        UNIQUE(repositoryId, path)
      );

      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_type ON files(fileType);
    `);
  }

  async getOrCreateRepository(repoName: string): Promise<number> {
    console.log('🔍 DEBUG: getOrCreateRepository called for:', repoName);
    console.log('🔍 DEBUG: Database connection status:', this.db ? 'connected' : 'null');
    
    if (!this.db) {
      console.error('❌ Database is null in getOrCreateRepository');
      throw new Error('Database not initialized');
    }
    
    let repo = await this.db.get(
      'SELECT id FROM repositories WHERE name = ?',
      repoName
    );
    
    console.log('🔍 DEBUG: Repository lookup result:', repo);

    if (!repo) {
      const result = await this.db!.run(
        'INSERT INTO repositories (name, lastIndexed) VALUES (?, ?)',
        repoName,
        new Date().toISOString()
      );
      return result.lastID!;
    }

    return repo.id;
  }

  async needsUpdate(repoName: string, branch: string = 'main'): Promise<boolean> {
    console.log('🔍 DEBUG: needsUpdate called for:', repoName);
    console.log('🔍 DEBUG: Database status in needsUpdate:', this.db ? 'connected' : 'null');
    
    // Ensure database is initialized before any operations
    await this.initialize();
    
    const repo = await this.db!.get(
      'SELECT lastCommitHash FROM repositories WHERE name = ?',
      repoName
    );

    if (!repo || !repo.lastCommitHash) return true;

    try {
      // Get current commit hash from GitHub API
      const response = await fetch(`https://api.github.com/repos/${repoName}/commits/${branch}`, {
        headers: {
          Authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`,
          'User-Agent': 'CodebaseIndexer'
        }
      });

      if (!response.ok) return true;

      const commit = await response.json();
      const currentHash = commit.sha;

      console.log(`🔍 Repo ${repoName}: stored=${repo.lastCommitHash?.substring(0, 7)} current=${currentHash.substring(0, 7)}`);
      
      return repo.lastCommitHash !== currentHash;
    } catch (error) {
      console.log('Could not check commit hash, assuming update needed');
      return true;
    }
  }

  async indexRepository(repoName: string, branch: string = 'main'): Promise<void> {
    console.log(`📚 Indexing repository: ${repoName}`);
    
    await this.initialize();
    
    const repoId = await this.getOrCreateRepository(repoName);
    const tempDir = join(tmpdir(), 'codebase-index', repoName.replace('/', '-'));

    try {
      // Clean up any existing temp directory
      if (existsSync(tempDir)) {
        execSync(`rm -rf "${tempDir}"`);
      }

      // Clone repository (shallow clone for speed)
      console.log('📥 Cloning repository...');
      const git = simpleGit();
      await git.clone(`https://github.com/${repoName}.git`, tempDir, [
        '--depth', '1', 
        '--branch', branch,
        '--single-branch'
      ]);

      // Get current commit hash
      const repoGit = simpleGit(tempDir);
      const log = await repoGit.log(['-1']);
      const currentHash = log.latest?.hash;

      // Clear existing files for this repo
      await this.db!.run('DELETE FROM files WHERE repositoryId = ?', repoId);

      // Index all relevant files
      const files = this.findRelevantFiles(tempDir);
      console.log(`📄 Found ${files.length} relevant files to index`);

      let indexed = 0;
      for (const filePath of files) {
        try {
          await this.indexFile(repoId, filePath, tempDir);
          indexed++;
          
          if (indexed % 10 === 0) {
            console.log(`📊 Indexed ${indexed}/${files.length} files`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to index ${filePath}:`, error);
        }
      }

      // Update repository metadata
      await this.db!.run(
        'UPDATE repositories SET lastCommitHash = ?, lastIndexed = ?, totalFiles = ? WHERE id = ?',
        currentHash,
        new Date().toISOString(),
        indexed,
        repoId
      );

      console.log(`✅ Successfully indexed ${indexed} files from ${repoName}`);

      // Cleanup
      execSync(`rm -rf "${tempDir}"`);

    } catch (error) {
      console.error('❌ Error indexing repository:', error);
      
      // Cleanup on error
      if (existsSync(tempDir)) {
        execSync(`rm -rf "${tempDir}"`);
      }
      
      throw error;
    }
  }

  private findRelevantFiles(repoPath: string): string[] {
    try {
      // Include ALL common web files, not just JS/TS
      const output = execSync(`find "${repoPath}" -type f \\( -name "*.html" -o -name "*.htm" -o -name "*.css" -o -name "*.scss" -o -name "*.sass" -o -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" -o -name "*.xml" -o -name "*.php" -o -name "*.py" -o -name "*.rb" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.c" -o -name "*.cpp" -o -name "*.h" \\) ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.git/*" ! -path "*/vendor/*" ! -path "*/__pycache__/*" ! -path "*/target/*"`, 
        { encoding: 'utf-8' }
      );
      
      const files = output.trim().split('\n').filter(Boolean);
      console.log(`📄 Found ${files.length} relevant files in repository`);
      
      // Log first few files for debugging
      files.slice(0, 10).forEach(file => {
        console.log(`  - ${file.replace(repoPath + '/', '')}`);
      });
      
      return files;
    } catch (error) {
      console.error('Error finding files:', error);
      return [];
    }
  }

  private async indexFile(repoId: number, fullPath: string, repoRoot: string): Promise<void> {
    const relativePath = fullPath.replace(repoRoot + '/', '');
    const content = readFileSync(fullPath, 'utf-8');
    
    // Skip large files
    if (content.length > 50000) {
      console.log(`⏭️ Skipping large file: ${relativePath}`);
      return;
    }

    // Generate content hash
    const crypto = await import('crypto');
    const contentHash = crypto.createHash('md5').update(content).digest('hex');

    // Extract file metadata
    const fileType = this.getFileType(relativePath);
    const { imports, exports } = this.extractImportsExports(content, fileType);

    // Generate embedding for semantic search
    const embedding = await this.generateEmbedding(relativePath, content);

    // Store in database
    await this.db!.run(`
      INSERT OR REPLACE INTO files 
      (repositoryId, path, content, contentHash, size, lastModified, fileType, embedding, imports, exports)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      repoId,
      relativePath,
      content,
      contentHash,
      content.length,
      new Date().toISOString(),
      fileType,
      JSON.stringify(embedding),
      JSON.stringify(imports),
      JSON.stringify(exports)
    ]);
  }

  private getFileType(path: string): string {
    const ext = extname(path);
    const name = path.split('/').pop() || '';

    // Web files
    if (ext === '.html' || ext === '.htm') return 'page';
    if (ext === '.css' || ext === '.scss' || ext === '.sass') return 'style';
    
    // React/JS files
    if (ext === '.tsx' || ext === '.jsx') return 'component';
    if (ext === '.ts' || ext === '.js') {
      if (path.includes('/api/') || name.includes('route')) return 'api';
      if (path.includes('/lib/') || path.includes('/utils/')) return 'utility';
      if (name === 'layout.tsx' || name === 'page.tsx') return 'page';
      return 'script';
    }
    
    // Config and data
    if (ext === '.json') {
      if (name === 'package.json') return 'config';
      return 'data';
    }
    if (ext === '.yml' || ext === '.yaml') return 'config';
    if (ext === '.xml') return 'data';
    
    // Documentation
    if (ext === '.md') return 'documentation';
    
    // Other languages
    if (ext === '.php') return 'script';
    if (ext === '.py') return 'script';
    if (ext === '.rb') return 'script';
    if (ext === '.go') return 'script';
    if (ext === '.rs') return 'script';
    if (ext === '.java') return 'script';
    if (ext === '.c' || ext === '.cpp' || ext === '.h') return 'script';
    
    return 'other';
  }

  private extractImportsExports(content: string, fileType: string): { imports: string[], exports: string[] } {
    const imports: string[] = [];
    const exports: string[] = [];

    if (fileType === 'component' || fileType === 'script' || fileType === 'utility') {
      // Extract imports
      const importRegex = /import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // Extract exports
      const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return { imports, exports };
  }

  private async generateEmbedding(path: string, content: string): Promise<number[]> {
    // Create a summary for embedding (path + key content)
    const summary = `${path}\n${content.substring(0, 1000)}`;
    
    try {
      const result = await this.embedder(summary, { pooling: 'mean', normalize: true });
      return Array.from(result.data);
    } catch (error) {
      console.warn('Failed to generate embedding, using zero vector');
      return new Array(384).fill(0); // MiniLM-L6-v2 has 384 dimensions
    }
  }

  async getAllFiles(repoName: string): Promise<{ path: string; content: string; fileType: string }[]> {
    console.log('🔍 DEBUG: getAllFiles called for:', repoName);
    await this.initialize();
    
    const repoId = await this.getOrCreateRepository(repoName);
    
    // Get all files from database
    const files = await this.db!.all(`
      SELECT path, content, fileType FROM files WHERE repositoryId = ?
    `, repoId);

    return files;
  }

  async searchRelevantFiles(repoName: string, taskDescription: string, limit: number = 10): Promise<SearchResult[]> {
    await this.initialize();
    
    console.log('🔍 DEBUG: Starting search for:', { repoName, taskDescription, limit });
    
    const repoId = await this.getOrCreateRepository(repoName);
    console.log('🔍 DEBUG: Repository ID:', repoId);
    
    // Generate embedding for task description
    const taskEmbedding = await this.generateEmbedding('task', taskDescription);
    console.log('🔍 DEBUG: Generated task embedding, length:', taskEmbedding.length);
    
    // Get all files from database
    const files = await this.db!.all(`
      SELECT * FROM files WHERE repositoryId = ?
    `, repoId);
    
    console.log('🔍 DEBUG: Found files in database:', files.length);
    files.forEach(file => {
      console.log(`  📄 ${file.path} (${file.fileType})`);
    });

    // Calculate similarity scores
    const results: SearchResult[] = [];
    
    for (const file of files) {
      console.log(`🔍 DEBUG: Analyzing file: ${file.path}`);
      let score = 0;
      let reason = '';

      // Parse stored embedding
      const fileEmbedding = JSON.parse(file.embedding || '[]');
      
      if (fileEmbedding.length > 0) {
        // Cosine similarity
        score = this.cosineSimilarity(taskEmbedding, fileEmbedding);
        reason = 'semantic similarity';
        console.log(`  📊 Base semantic score: ${score.toFixed(3)}`);
      } else {
        console.log(`  ⚠️ No embedding found for ${file.path}`);
      }

      // Boost score based on file type and task keywords
      const taskLower = taskDescription.toLowerCase();
      
      // SMART REASONING: header/topbar/navigation tasks almost always need the main HTML file
      const isUITask = taskLower.includes('header') || taskLower.includes('topbar') || taskLower.includes('navigation') || 
                      taskLower.includes('nav') || taskLower.includes('title') || taskLower.includes('menu');
      
      if (isUITask) {
        // For UI changes, prioritize main HTML files extremely highly
        if (file.path === 'index.html' || file.path.includes('index.html')) {
          score += 3.0; // Massive boost for main HTML file in UI tasks
          reason += ', main HTML file for UI change';
        } else if (file.path.endsWith('.html')) {
          score += 1.5; // High boost for any HTML file
          reason += ', HTML file for UI change';
        } else if (file.fileType === 'page') {
          score += 0.8; // Boost for page files
          reason += ', page content for UI change';
        }
      }
      
      // Style-related tasks
      if ((taskLower.includes('style') || taskLower.includes('css') || taskLower.includes('color')) && file.fileType === 'style') {
        score += 0.4;
        reason += ', styling task';
      }
      
      // General HTML file prioritization
      if (file.path === 'index.html' || file.path.includes('index.html') || file.path.endsWith('.html')) {
        score += 0.5; // Base boost for HTML files
        reason += ', HTML file';
      }
      
      // CRITICAL: Exact text match should trump everything else
      const taskWords = taskDescription.toLowerCase().split(/\s+/);
      const fileContentLower = file.content.toLowerCase();
      
      // Extract quoted text from task (text between quotes)
      const quotedMatches = taskDescription.match(/'([^']+)'/g) || taskDescription.match(/"([^"]+)"/g) || [];
      
      // For change/replace tasks, only look for the first quoted text (the text to find)
      if (quotedMatches.length > 0) {
        const isChangeTask = taskLower.includes('change') || taskLower.includes('replace') || taskLower.includes('update');
        const quotesToCheck = isChangeTask ? [quotedMatches[0]] : quotedMatches;
        
        for (const quotedMatch of quotesToCheck) {
          const cleanQuote = quotedMatch.replace(/['"]/g, '').toLowerCase();
          console.log(`  🔍 Checking for quoted text: "${cleanQuote}" in ${file.path}`);
          if (fileContentLower.includes(cleanQuote)) {
            score += 2.0; // Massive boost for exact quoted text match
            reason += `, contains exact text "${cleanQuote}"`;
            console.log(`  🎯 FOUND "${cleanQuote}" in ${file.path}, score boosted to ${score.toFixed(3)}`);
          } else {
            console.log(`  ❌ "${cleanQuote}" NOT found in ${file.path}`);
          }
        }
      }
      
      // Also check for individual words that suggest specific text changes
      if (taskLower.includes('change') || taskLower.includes('replace') || taskLower.includes('update')) {
        // Look for any word from the task in the file content
        for (const word of taskWords) {
          if (word.length > 3 && fileContentLower.includes(word)) {
            score += 0.3;
            reason += `, contains "${word}"`;
          }
        }
      }
      
      // React/component specific boosts
      if (taskLower.includes('component') && file.fileType === 'component') {
        score += 0.3;
        reason += ', component task';
      }
      if (taskLower.includes('api') && file.fileType === 'api') {
        score += 0.3;
        reason += ', API task';
      }
      if (taskLower.includes('page') && file.fileType === 'page') {
        score += 0.3;
        reason += ', page task';
      }
      
      // Always include important config files
      if (file.path === 'package.json') {
        score += 0.2;
        reason += ', essential config';
      }

      console.log(`  📊 Final score for ${file.path}: ${score.toFixed(3)} (reason: ${reason.replace(/^, /, '') || 'no match'})`);
      
      if (score > 0.1) { // Threshold to filter out irrelevant files
        console.log(`  ✅ Adding ${file.path} to results`);
        results.push({
          file: {
            path: file.path,
            content: file.content,
            contentHash: file.contentHash,
            size: file.size,
            lastModified: file.lastModified,
            fileType: file.fileType,
            imports: JSON.parse(file.imports || '[]'),
            exports: JSON.parse(file.exports || '[]')
          },
          score,
          reason: reason.replace(/^, /, '')
        });
      } else {
        console.log(`  ❌ Excluding ${file.path} (score too low: ${score.toFixed(3)})`);
      }
    }

    // Sort by score and return top results
    const finalResults = results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    console.log('🔍 DEBUG: Final search results:');
    finalResults.forEach(result => {
      console.log(`  🏆 ${result.file.path} - Score: ${result.score.toFixed(3)} - ${result.reason}`);
    });
    
    return finalResults;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async getRepositoryStats(repoName: string): Promise<any> {
    await this.initialize();
    
    const repo = await this.db!.get(
      'SELECT * FROM repositories WHERE name = ?',
      repoName
    );

    if (!repo) return null;

    const fileStats = await this.db!.all(`
      SELECT fileType, COUNT(*) as count 
      FROM files 
      WHERE repositoryId = ? 
      GROUP BY fileType
    `, repo.id);

    return {
      ...repo,
      fileBreakdown: fileStats
    };
  }
}

export const codebaseIndex = new CodebaseIndexService();