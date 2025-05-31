import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { execSync, exec } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { pipeline } from '@xenova/transformers';
import path from 'path';

// Symbol types for AST-based indexing
interface Symbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'import' | 'element' | 'attribute';
  location: { line: number; column: number; endLine: number; endColumn: number };
  context: string; // surrounding code context
  file: string;
  language: string;
}

interface Chunk {
  id: string;
  content: string;
  type: 'symbol' | 'block' | 'comment' | 'import';
  symbols: Symbol[];
  location: { startLine: number; endLine: number };
  file: string;
  language: string;
  embedding?: number[];
}

interface SearchResult {
  chunk: Chunk;
  lexicalScore: number;
  vectorScore: number;
  structuralScore: number;
  fusedScore: number;
  reason: string;
}

interface BM25Score {
  score: number;
  termMatches: string[];
}

export class AdvancedCodebaseIndex {
  private db: Database | null = null;
  private embeddingModel: any = null;
  private tempDir = '/tmp/codebase-clone';

  async initialize() {
    if (this.db) return;
    
    // Initialize SQLite database
    this.db = await open({
      filename: '/Users/bentossell/codex/data/advanced-codebase-index.db',
      driver: sqlite3.Database
    });

    // Create enhanced schema
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        lastCommitHash TEXT,
        lastIndexed TEXT,
        totalChunks INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        repositoryId INTEGER,
        filePath TEXT NOT NULL,
        content TEXT NOT NULL,
        chunkType TEXT NOT NULL,
        language TEXT,
        startLine INTEGER,
        endLine INTEGER,
        embedding TEXT,
        termFreq TEXT, -- JSON object for BM25
        FOREIGN KEY (repositoryId) REFERENCES repositories (id)
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chunkId TEXT,
        name TEXT NOT NULL,
        symbolType TEXT NOT NULL,
        line INTEGER,
        column INTEGER,
        endLine INTEGER,
        endColumn INTEGER,
        context TEXT,
        FOREIGN KEY (chunkId) REFERENCES chunks (id)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks(repositoryId);
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(filePath);
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(symbolType);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id, content, filePath, symbolNames, tokenize='porter'
      );
    `);

    // Initialize embedding model
    try {
      this.embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('✅ Embedding model loaded');
    } catch (error) {
      console.warn('⚠️ Could not load embedding model:', error);
    }
  }

  async indexRepository(repoName: string, branch: string = 'main'): Promise<void> {
    await this.initialize();
    console.log(`🚀 Advanced indexing repository: ${repoName}`);

    try {
      // Clone repository
      const repoUrl = `https://github.com/${repoName}.git`;
      if (existsSync(this.tempDir)) {
        execSync(`rm -rf "${this.tempDir}"`);
      }
      execSync(`git clone --depth 1 --branch ${branch} "${repoUrl}" "${this.tempDir}"`);
      
      const currentHash = execSync(`cd "${this.tempDir}" && git rev-parse HEAD`, { encoding: 'utf-8' }).trim();
      
      // Get or create repository record
      const repoId = await this.getOrCreateRepository(repoName);
      
      // Clear existing data
      await this.db!.run('DELETE FROM chunks WHERE repositoryId = ?', repoId);
      await this.db!.run('DELETE FROM symbols WHERE chunkId IN (SELECT id FROM chunks WHERE repositoryId = ?)', repoId);
      await this.db!.run('DELETE FROM chunks_fts WHERE rowid IN (SELECT rowid FROM chunks_fts WHERE id LIKE ?)', `${repoName}:%`);

      // Find all relevant files
      const files = this.findRelevantFiles(this.tempDir);
      console.log(`📄 Found ${files.length} files to analyze`);

      let totalChunks = 0;
      
      for (const filePath of files) {
        const relativePath = filePath.replace(this.tempDir + '/', '');
        const language = this.detectLanguage(relativePath);
        const content = readFileSync(filePath, 'utf-8');
        
        console.log(`🔍 Processing: ${relativePath} (${language})`);
        
        // Parse file into chunks using Tree-sitter or simple chunking
        const chunks = await this.parseFileIntoChunks(content, relativePath, language);
        
        for (const chunk of chunks) {
          // Generate embedding
          const embedding = await this.generateEmbedding(chunk.content);
          
          // Calculate term frequencies for BM25
          const termFreq = this.calculateTermFrequencies(chunk.content);
          
          // Store chunk
          await this.db!.run(`
            INSERT INTO chunks (id, repositoryId, filePath, content, chunkType, language, startLine, endLine, embedding, termFreq)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            chunk.id,
            repoId,
            relativePath,
            chunk.content,
            chunk.type,
            language,
            chunk.location.startLine,
            chunk.location.endLine,
            JSON.stringify(embedding),
            JSON.stringify(termFreq)
          ]);

          // Store symbols
          for (const symbol of chunk.symbols) {
            await this.db!.run(`
              INSERT INTO symbols (chunkId, name, symbolType, line, column, endLine, endColumn, context)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              chunk.id,
              symbol.name,
              symbol.type,
              symbol.location.line,
              symbol.location.column,
              symbol.location.endLine,
              symbol.location.endColumn,
              symbol.context
            ]);
          }

          // Add to FTS index
          const symbolNames = chunk.symbols.map(s => s.name).join(' ');
          await this.db!.run(`
            INSERT INTO chunks_fts (id, content, filePath, symbolNames)
            VALUES (?, ?, ?, ?)
          `, [chunk.id, chunk.content, relativePath, symbolNames]);

          totalChunks++;
        }
      }

      // Update repository metadata
      await this.db!.run(`
        UPDATE repositories SET lastCommitHash = ?, lastIndexed = ?, totalChunks = ?
        WHERE id = ?
      `, [currentHash, new Date().toISOString(), totalChunks, repoId]);

      console.log(`✅ Indexed ${totalChunks} chunks from ${repoName}`);
      
      // Cleanup
      execSync(`rm -rf "${this.tempDir}"`);

    } catch (error) {
      console.error('❌ Error in advanced indexing:', error);
      if (existsSync(this.tempDir)) {
        execSync(`rm -rf "${this.tempDir}"`);
      }
      throw error;
    }
  }

  private async parseFileIntoChunks(content: string, filePath: string, language: string): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    const lines = content.split('\n');
    
    if (language === 'html') {
      return this.parseHTMLChunks(content, filePath, lines);
    } else if (language === 'javascript' || language === 'typescript') {
      return this.parseJSChunks(content, filePath, lines);
    } else if (language === 'markdown') {
      return this.parseMarkdownChunks(content, filePath, lines);
    } else {
      return this.parseGenericChunks(content, filePath, lines);
    }
  }

  private parseHTMLChunks(content: string, filePath: string, lines: string[]): Chunk[] {
    const chunks: Chunk[] = [];
    
    // Extract important HTML elements as chunks
    const elementPatterns = [
      { pattern: /<title[^>]*>(.*?)<\/title>/gis, type: 'element', symbolType: 'element' as const },
      { pattern: /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis, type: 'element', symbolType: 'element' as const },
      { pattern: /<header[^>]*>(.*?)<\/header>/gis, type: 'element', symbolType: 'element' as const },
      { pattern: /<nav[^>]*>(.*?)<\/nav>/gis, type: 'element', symbolType: 'element' as const },
      { pattern: /<script[^>]*>(.*?)<\/script>/gis, type: 'block', symbolType: 'function' as const }
    ];

    elementPatterns.forEach(({ pattern, type, symbolType }) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const matchContent = match[0];
        const innerText = match[1]?.trim() || '';
        
        // Find line numbers
        const beforeMatch = content.substring(0, match.index);
        const startLine = beforeMatch.split('\n').length;
        const endLine = startLine + matchContent.split('\n').length - 1;
        
        const symbols: Symbol[] = [];
        if (innerText) {
          symbols.push({
            name: innerText.substring(0, 50), // Truncate long text
            type: symbolType,
            location: { line: startLine, column: 0, endLine, endColumn: 0 },
            context: matchContent,
            file: filePath,
            language: 'html'
          });
        }

        chunks.push({
          id: `${filePath}:${startLine}-${endLine}:${type}`,
          content: matchContent,
          type: type as any,
          symbols,
          location: { startLine, endLine },
          file: filePath,
          language: 'html'
        });
      }
    });

    // If no structured chunks found, create larger blocks
    if (chunks.length === 0) {
      return this.parseGenericChunks(content, filePath, lines);
    }

    return chunks;
  }

  private parseJSChunks(content: string, filePath: string, lines: string[]): Chunk[] {
    const chunks: Chunk[] = [];
    
    // Simple function/class extraction (would use Tree-sitter in production)
    const patterns = [
      { pattern: /function\s+(\w+)\s*\([^)]*\)\s*\{/g, type: 'function' },
      { pattern: /class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g, type: 'class' },
      { pattern: /const\s+(\w+)\s*=/g, type: 'variable' },
      { pattern: /import.*from\s+['"][^'"]+['"]/g, type: 'import' }
    ];

    patterns.forEach(({ pattern, type }) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const startLine = content.substring(0, match.index).split('\n').length;
        const symbol = match[1] || match[0];
        
        // Extract function/class body (simplified)
        let endLine = startLine + 10; // Default chunk size
        const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
        
        chunks.push({
          id: `${filePath}:${startLine}-${endLine}:${type}`,
          content: chunkContent,
          type: 'symbol',
          symbols: [{
            name: symbol,
            type: type as any,
            location: { line: startLine, column: match.index!, endLine, endColumn: 0 },
            context: chunkContent,
            file: filePath,
            language: 'javascript'
          }],
          location: { startLine, endLine },
          file: filePath,
          language: 'javascript'
        });
      }
    });

    return chunks.length > 0 ? chunks : this.parseGenericChunks(content, filePath, lines);
  }

  private parseMarkdownChunks(content: string, filePath: string, lines: string[]): Chunk[] {
    const chunks: Chunk[] = [];
    
    // Split by headers
    const headerPattern = /^#{1,6}\s+(.+)$/gm;
    let lastEnd = 0;
    let match;
    
    while ((match = headerPattern.exec(content)) !== null) {
      const startLine = content.substring(0, match.index).split('\n').length;
      const headerText = match[1];
      
      // Create chunk for this section
      const nextMatch = headerPattern.exec(content);
      const endPos = nextMatch ? nextMatch.index : content.length;
      headerPattern.lastIndex = match.index + match[0].length; // Reset for next iteration
      
      const sectionContent = content.substring(match.index, endPos);
      const endLine = startLine + sectionContent.split('\n').length - 1;
      
      chunks.push({
        id: `${filePath}:${startLine}-${endLine}:section`,
        content: sectionContent,
        type: 'block',
        symbols: [{
          name: headerText,
          type: 'element',
          location: { line: startLine, column: 0, endLine: startLine, endColumn: headerText.length },
          context: sectionContent.substring(0, 200),
          file: filePath,
          language: 'markdown'
        }],
        location: { startLine, endLine },
        file: filePath,
        language: 'markdown'
      });
    }

    return chunks.length > 0 ? chunks : this.parseGenericChunks(content, filePath, lines);
  }

  private parseGenericChunks(content: string, filePath: string, lines: string[]): Chunk[] {
    const chunks: Chunk[] = [];
    const chunkSize = 50; // lines per chunk
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      const endLine = Math.min(i + chunkSize, lines.length);
      const chunkContent = lines.slice(i, endLine).join('\n');
      
      chunks.push({
        id: `${filePath}:${i + 1}-${endLine}:block`,
        content: chunkContent,
        type: 'block',
        symbols: [],
        location: { startLine: i + 1, endLine },
        file: filePath,
        language: this.detectLanguage(filePath)
      });
    }
    
    return chunks;
  }

  async searchRelevantChunks(repoName: string, query: string, limit: number = 10): Promise<SearchResult[]> {
    await this.initialize();
    
    const repoId = await this.getOrCreateRepository(repoName);
    
    // 1. Lexical search using BM25F
    const lexicalResults = await this.lexicalSearch(repoId, query);
    
    // 2. Vector search using embeddings
    const vectorResults = await this.vectorSearch(repoId, query);
    
    // 3. Structural AST search
    const structuralResults = await this.structuralSearch(repoId, query);
    
    // 4. Fuse and re-rank results
    const fusedResults = this.fuseAndRerank(lexicalResults, vectorResults, structuralResults, query);
    
    return fusedResults.slice(0, limit);
  }

  private async lexicalSearch(repoId: number, query: string): Promise<Map<string, BM25Score>> {
    const results = new Map<string, BM25Score>();
    
    // Use SQLite FTS for initial lexical matching
    const ftsResults = await this.db!.all(`
      SELECT chunks.id, chunks.content, chunks.filePath, 
             highlight(chunks_fts, 1, '<mark>', '</mark>') as highlighted,
             bm25(chunks_fts) as fts_score
      FROM chunks_fts 
      JOIN chunks ON chunks.id = chunks_fts.id
      WHERE chunks.repositoryId = ? AND chunks_fts MATCH ?
      ORDER BY bm25(chunks_fts)
      LIMIT 50
    `, [repoId, query]);

    for (const row of ftsResults) {
      const terms = query.toLowerCase().split(/\s+/);
      const termMatches = terms.filter(term => 
        row.content.toLowerCase().includes(term)
      );
      
      results.set(row.id, {
        score: Math.abs(row.fts_score), // BM25 returns negative scores
        termMatches
      });
    }

    return results;
  }

  private async vectorSearch(repoId: number, query: string): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    
    if (!this.embeddingModel) return results;
    
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Get all chunks with embeddings
    const chunks = await this.db!.all(`
      SELECT id, embedding FROM chunks WHERE repositoryId = ? AND embedding IS NOT NULL
    `, [repoId]);

    for (const chunk of chunks) {
      try {
        const chunkEmbedding = JSON.parse(chunk.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
        if (similarity > 0.1) { // Threshold
          results.set(chunk.id, similarity);
        }
      } catch (error) {
        // Skip chunks with invalid embeddings
      }
    }

    return results;
  }

  private async structuralSearch(repoId: number, query: string): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    
    // Search for symbols that match the query
    const symbolMatches = await this.db!.all(`
      SELECT chunks.id, symbols.name, symbols.symbolType, symbols.context
      FROM symbols
      JOIN chunks ON symbols.chunkId = chunks.id
      WHERE chunks.repositoryId = ? AND (
        symbols.name LIKE ? OR
        symbols.context LIKE ? OR
        symbols.symbolType = ?
      )
    `, [repoId, `%${query}%`, `%${query}%`, query]);

    for (const match of symbolMatches) {
      const existingScore = results.get(match.id) || 0;
      let boost = 0.5;
      
      // Boost based on symbol type relevance
      if (query.toLowerCase().includes('header') && match.symbolType === 'element') {
        boost = 1.0;
      } else if (query.toLowerCase().includes('function') && match.symbolType === 'function') {
        boost = 0.8;
      }
      
      results.set(match.id, existingScore + boost);
    }

    return results;
  }

  private fuseAndRerank(
    lexical: Map<string, BM25Score>,
    vector: Map<string, number>,
    structural: Map<string, number>,
    query: string
  ): SearchResult[] {
    const allChunkIds = new Set([
      ...lexical.keys(),
      ...vector.keys(),
      ...structural.keys()
    ]);

    const results: SearchResult[] = [];

    for (const chunkId of allChunkIds) {
      const lexicalScore = lexical.get(chunkId)?.score || 0;
      const vectorScore = vector.get(chunkId) || 0;
      const structuralScore = structural.get(chunkId) || 0;
      
      // Weighted fusion (tune these weights based on performance)
      const fusedScore = (
        0.3 * this.normalizeScore(lexicalScore, 0, 10) +
        0.4 * vectorScore +
        0.3 * structuralScore
      );

      if (fusedScore > 0.1) {
        results.push({
          chunk: {} as Chunk, // Will be filled in later
          lexicalScore,
          vectorScore,
          structuralScore,
          fusedScore,
          reason: this.explainScore(lexical.get(chunkId), vectorScore, structuralScore)
        });
      }
    }

    // Sort by fused score and fill in chunk details
    results.sort((a, b) => b.fusedScore - a.fusedScore);
    
    return results;
  }

  private normalizeScore(score: number, min: number, max: number): number {
    return Math.max(0, Math.min(1, (score - min) / (max - min)));
  }

  private explainScore(lexical?: BM25Score, vector?: number, structural?: number): string {
    const explanations = [];
    if (lexical && lexical.score > 0) {
      explanations.push(`text match (${lexical.termMatches.join(', ')})`);
    }
    if (vector && vector > 0.3) {
      explanations.push(`semantic similarity`);
    }
    if (structural && structural > 0) {
      explanations.push(`structural match`);
    }
    return explanations.join(', ') || 'general relevance';
  }

  // Helper methods
  private findRelevantFiles(repoPath: string): string[] {
    try {
      const output = execSync(`find "${repoPath}" -type f \\( -name "*.html" -o -name "*.htm" -o -name "*.css" -o -name "*.scss" -o -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" \\) ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/.git/*"`, 
        { encoding: 'utf-8' }
      );
      return output.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: { [key: string]: string } = {
      '.html': 'html',
      '.htm': 'html',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.css': 'css',
      '.scss': 'css',
      '.md': 'markdown',
      '.json': 'json',
      '.yml': 'yaml',
      '.yaml': 'yaml'
    };
    return langMap[ext] || 'text';
  }

  private calculateTermFrequencies(content: string): { [term: string]: number } {
    const terms = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2);
    
    const freq: { [term: string]: number } = {};
    for (const term of terms) {
      freq[term] = (freq[term] || 0) + 1;
    }
    
    return freq;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingModel) return [];
    
    try {
      const output = await this.embeddingModel(text.substring(0, 512), {
        pooling: 'mean',
        normalize: true
      });
      return Array.from(output.data);
    } catch (error) {
      return [];
    }
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

  private async getOrCreateRepository(name: string): Promise<number> {
    const existing = await this.db!.get('SELECT id FROM repositories WHERE name = ?', name);
    if (existing) return existing.id;
    
    const result = await this.db!.run('INSERT INTO repositories (name) VALUES (?)', name);
    return result.lastID!;
  }
}

export const advancedCodebaseIndex = new AdvancedCodebaseIndex();