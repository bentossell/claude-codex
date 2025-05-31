import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

interface SmartSearchResult {
  file: {
    path: string;
    content: string;
    fileType: string;
  };
  score: number;
  reason: string;
}

export class SmartSearch {
  
  static async searchForTask(repository: string, taskDescription: string): Promise<SmartSearchResult[]> {
    console.log('🧠 Smart search for task:', taskDescription);
    
    const db = await open({
      filename: '/Users/bentossell/codex/data/codebase-index.db',
      driver: sqlite3.Database
    });

    const repoId = await db.get('SELECT id FROM repositories WHERE name = ?', repository);
    if (!repoId) {
      console.log('❌ Repository not found in index');
      return [];
    }

    const taskLower = taskDescription.toLowerCase();
    const isUITask = taskLower.includes('header') || taskLower.includes('topbar') || taskLower.includes('navigation') || 
                    taskLower.includes('nav') || taskLower.includes('title') || taskLower.includes('menu');

    // Extract quoted text to find
    const quotedText = taskDescription.match(/'([^']+)'/g) || taskDescription.match(/"([^"]+)"/g) || [];
    const textToFind = quotedText.length > 0 ? quotedText[0].replace(/['"]/g, '') : '';

    console.log('🎯 Search parameters:', { isUITask, textToFind });

    let results: SmartSearchResult[] = [];

    if (isUITask && textToFind) {
      // For UI tasks, prioritize HTML files that contain the target text
      console.log('🔍 Searching for UI changes...');
      
      const htmlFiles = await db.all(`
        SELECT path, content, fileType 
        FROM files f 
        WHERE f.repositoryId = ? 
        AND (f.path LIKE '%.html' OR f.path LIKE '%.htm')
        AND LOWER(f.content) LIKE ?
        ORDER BY 
          CASE WHEN f.path = 'index.html' THEN 1 ELSE 2 END,
          f.path
      `, [repoId.id, `%${textToFind.toLowerCase()}%`]);

      for (const file of htmlFiles) {
        results.push({
          file: {
            path: file.path,
            content: file.content,
            fileType: file.fileType || 'page'
          },
          score: file.path === 'index.html' ? 10.0 : 8.0,
          reason: `HTML file containing "${textToFind}" for UI change`
        });
      }

      // If no HTML files found, search all files for the text
      if (results.length === 0) {
        console.log('🔍 No HTML files found, searching all files...');
        
        const allFiles = await db.all(`
          SELECT path, content, fileType 
          FROM files f 
          WHERE f.repositoryId = ? 
          AND LOWER(f.content) LIKE ?
          ORDER BY 
            CASE 
              WHEN f.path LIKE '%.html' THEN 1
              WHEN f.path LIKE '%.js' OR f.path LIKE '%.jsx' OR f.path LIKE '%.ts' OR f.path LIKE '%.tsx' THEN 2
              ELSE 3 
            END,
            f.path
        `, [repoId.id, `%${textToFind.toLowerCase()}%`]);

        for (const file of allFiles) {
          results.push({
            file: {
              path: file.path,
              content: file.content,
              fileType: file.fileType || 'unknown'
            },
            score: file.path.endsWith('.html') ? 5.0 : 3.0,
            reason: `File containing "${textToFind}"`
          });
        }
      }
    }

    // If still no results, do a broader search
    if (results.length === 0) {
      console.log('🔍 Doing broader search...');
      
      const keywords = taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const keywordPattern = keywords.map(k => `%${k}%`).join(' OR LOWER(content) LIKE ');
      
      const broadFiles = await db.all(`
        SELECT path, content, fileType 
        FROM files f 
        WHERE f.repositoryId = ? 
        AND (${keywords.map(() => 'LOWER(f.content) LIKE ?').join(' OR ')})
        ORDER BY 
          CASE 
            WHEN f.path LIKE '%.html' THEN 1
            WHEN f.path LIKE '%.js' OR f.path LIKE '%.jsx' OR f.path LIKE '%.ts' OR f.path LIKE '%.tsx' THEN 2
            ELSE 3 
          END,
          f.path
        LIMIT 10
      `, [repoId.id, ...keywords.map(k => `%${k}%`)]);

      for (const file of broadFiles) {
        results.push({
          file: {
            path: file.path,
            content: file.content,
            fileType: file.fileType || 'unknown'
          },
          score: 1.0,
          reason: `Contains relevant keywords`
        });
      }
    }

    await db.close();

    console.log(`✅ Smart search found ${results.length} results`);
    results.forEach(result => {
      console.log(`  - ${result.file.path} (score: ${result.score}, ${result.reason})`);
    });

    return results;
  }
}