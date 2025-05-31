import Anthropic from '@anthropic-ai/sdk';
import { Task, CodeChange } from '@/types';
import { getRepositoryContext } from './git-service';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is not set');
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CodeGenerationResult {
  files: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete';
    content: string;
    diff: string;
    previousContent?: string;
  }>;
  summary: string;
  tokensUsed: number;
}

export class ClaudeService {
  private model = 'claude-3-opus-20240229';

  async generateCode(task: Task, additionalContext?: string): Promise<CodeGenerationResult> {
    console.log('🔍 Starting code generation for task:', task.id);
    
    try {
      // Get repository context with task-specific focus
      console.log('📂 Fetching repository context...');
      console.log('🔧 DEBUG: About to call getRepositoryContext with:', { 
        repository: task.repository, 
        branch: task.branch, 
        description: task.description 
      });
      
      const repoContext = await getRepositoryContext(task.repository, task.branch, task.description);
      
      console.log('✅ Repository context fetched successfully');
      console.log('🔧 DEBUG: Repository context result:', {
        structureLength: repoContext.structure?.length || 0,
        hasPackageJson: !!repoContext.packageJson,
        mainFilesCount: Object.keys(repoContext.mainFiles || {}).length,
        readme: repoContext.readme?.substring(0, 100) + '...'
      });
      
      // Log the first few files for debugging
      if (repoContext.mainFiles) {
        const fileNames = Object.keys(repoContext.mainFiles);
        console.log('📋 First 10 files in context:', fileNames.slice(0, 10));
        if (fileNames.length === 0) {
          console.error('❌ No files found in repository context!');
          throw new Error('Repository context contains no files. Repository may not be indexed properly.');
        }
      } else {
        console.error('❌ Repository mainFiles is null/undefined!');
        throw new Error('Repository context is invalid - mainFiles is missing.');
      }
      
      const prompt = this.buildPrompt(task, repoContext, additionalContext);
      console.log('📝 Generated prompt for Claude');
      console.log('🔧 DEBUG: Prompt includes files:', Object.keys(repoContext.mainFiles || {}).join(', '));
      console.log('🔧 DEBUG: Prompt length:', prompt.length);
      
      console.log('🤖 Calling Claude API...');
      const response = await anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0.2,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      console.log('✅ Claude API response received');
      console.log('📋 Response content types:', response.content.map(c => c.type));
      
      // Get text response and parse it manually
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent) {
        console.error('❌ No text response from Claude');
        throw new Error('Claude did not provide a text response');
      }
      
      const responseText = (textContent as any).text;
      console.log('📝 Claude response text (first 500 chars):', responseText.substring(0, 500));
      
      // Parse the file path from the prompt
      const filePath = Object.keys(repoContext.mainFiles)[0]; // We know we sent only one file
      
      // The entire response is the new file content
      const files = [{
        path: filePath,
        action: 'modify',
        content: responseText.trim(),
        diff: `Modified ${filePath}`
      }];
      
      console.log('✅ Using file from repository:', filePath);
      
      return {
        files: files,
        summary: `Modified ${filePath}`,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens
      };
    } catch (error) {
      console.error('❌ Error in code generation:', error);
      console.error('📊 Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        status: (error as any)?.status,
        response: (error as any)?.response?.data
      });
      
      // Check if it's a repository access error
      if (error instanceof Error && error.message.includes('Failed to analyze repository')) {
        throw new Error(`Repository access error: ${error.message}`);
      }
      
      // Re-throw with more context
      throw new Error(`Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exploreTask(task: Task): Promise<string> {
    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: 2000,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: `Please analyze this development task and provide insights, clarifications, or suggestions:

Task: ${task.title}
Description: ${task.description}
Repository: ${task.repository}
Branch: ${task.branch}

What questions should be considered? What approaches would you recommend?`
      }]
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  private buildPrompt(task: Task, repoContext: any, additionalContext?: string): string {
    const { mainFiles } = repoContext;
    
    // CRITICAL: Smart file selection to keep prompt small and focused
    const taskLower = task.description.toLowerCase();
    const isUITask = taskLower.includes('header') || taskLower.includes('topbar') || taskLower.includes('navigation') || 
                    taskLower.includes('nav') || taskLower.includes('title') || taskLower.includes('menu');
    
    // Extract quoted text to find
    const quotedText = task.description.match(/'([^']+)'/g) || task.description.match(/"([^"]+)"/g) || [];
    const targetText = quotedText.length > 0 ? quotedText[0].replace(/['"]/g, '') : '';
    
    // Smart file filtering - only include most relevant files
    let relevantFiles: { [key: string]: string } = {};
    const allFiles = Object.entries(mainFiles);
    
    console.log('🎯 Task analysis:', { isUITask, targetText, totalFiles: allFiles.length });
    
    // Strategy 1: If we have target text, find files that contain it
    if (targetText) {
      allFiles.forEach(([path, content]) => {
        if (typeof content === 'string' && content.toLowerCase().includes(targetText.toLowerCase())) {
          relevantFiles[path] = content;
          console.log('📍 Found target text in:', path);
        }
      });
    }
    
    // Strategy 2: For UI tasks, include ONLY the most relevant HTML files
    if (isUITask || Object.keys(relevantFiles).length === 0) {
      allFiles.forEach(([path, content]) => {
        if (path.toLowerCase().includes('index.html')) {
          relevantFiles[path] = content as string;
          console.log('📁 Including primary file:', path);
        }
      });
    }
    
    // Strategy 3: Fallback - include ONLY ONE most important file
    if (Object.keys(relevantFiles).length === 0) {
      const importantFile = allFiles.find(([path]) => path.includes('index')) || allFiles[0];
      if (importantFile) {
        relevantFiles = { [importantFile[0]]: importantFile[1] as string };
        console.log('📋 Using single fallback file:', importantFile[0]);
      }
    }
    
    // NO TRUNCATION for single file approach - keep ALL content
    Object.keys(relevantFiles).forEach(path => {
      const content = relevantFiles[path];
      console.log('📏 File size:', path, 'length:', content?.length || 0);
      // Keep full content - no truncation at all for primary editing
    });
    
    const selectedFiles = Object.keys(relevantFiles);
    console.log('🎯 Final selected files:', selectedFiles);
    
    // Build MINIMAL prompt to avoid overwhelming Claude
    const filePath = Object.keys(relevantFiles)[0];
    const fileContent = relevantFiles[filePath];
    
    console.log('📄 Sending file to Claude:', filePath);
    console.log('📏 File content length:', fileContent?.length || 0);
    console.log('📝 File ends with:', fileContent?.substring(fileContent.length - 200) || 'N/A');
    
    return `Task: ${task.description}

Here is the current content of ${filePath}:

${fileContent}

IMPORTANT: Please provide the COMPLETE updated file content with the requested changes. 
- Keep ALL existing content intact  
- Only modify the specific parts mentioned in the task
- Do not truncate or omit any sections
- Return the ENTIRE file with your changes
- The file should end with: </html>

Return ONLY the updated file content, nothing else.`;
  }

  private getSystemPrompt(): string {
    return `You are an expert software engineer modifying an EXISTING codebase.

CRITICAL CONSTRAINTS:
- You can ONLY modify files that are explicitly shown to you
- You CANNOT create new files
- You CANNOT reference files that don't exist in the provided list
- If you suggest a non-existent file, you will fail validation

PROCESS:
1. Read the provided files carefully
2. Identify which existing file needs to be modified
3. Make the requested change using the existing code style
4. Provide the complete updated file content

Always use the generate_code_changes tool with ONLY files from the provided list.`;
  }

  async generateCommitMessage(changes: CodeChange[]): Promise<string> {
    const fileList = changes.map(c => `${c.action} ${c.filePath}`).join('\n');
    
    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: 200,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `Generate a concise git commit message for these changes:\n${fileList}`
      }]
    });

    return response.content[0].type === 'text' ? response.content[0].text : 'Update files';
  }
}

export const claudeService = new ClaudeService();