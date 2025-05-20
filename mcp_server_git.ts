// mcp_server_git.ts
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { exec } from 'child_process';
import path from 'path';

const app = express();
const port = process.env.MCP_GIT_PORT || 3004;

app.use(bodyParser.json());

interface ToolCallRequestBody {
  tool_name: string;
  tool_input: any;
}

// Helper function to ensure path safety (prevent directory traversal)
function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

// Helper function to execute Git commands
function executeGitCommand(
  projectPath: string,
  gitCommandArgs: string[]
): Promise<any> {
  return new Promise((resolve, reject) => {
    const resolvedProjectPath = path.resolve(projectPath);
    
    // Construct the full Git command
    const command = `git ${gitCommandArgs.join(' ')}`;
    
    console.log(`[MCP Git Server] Executing Git command: ${command}`);
    console.log(`[MCP Git Server] Working directory: ${resolvedProjectPath}`);
    
    // Execute the Git command
    exec(command, { cwd: resolvedProjectPath }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[MCP Git Server] Git command execution error: ${error.message}`);
        reject({
          success: false,
          message: `Git command execution failed: ${error.message}`,
          data: { stdout, stderr, exitCode: error.code || 1 }
        });
      } else {
        console.log(`[MCP Git Server] Git command executed successfully`);
        resolve({
          success: true,
          data: { stdout, stderr, exitCode: 0 }
        });
      }
    });
  });
}

// POST /tools/call endpoint
app.post('/tools/call', async (req: Request, res: Response) => {
  const { tool_name, tool_input } = req.body as ToolCallRequestBody;

  console.log(`[MCP Git Server] Received tool call for: ${tool_name}`, tool_input);

  try {
    switch (tool_name) {
      case 'git_init': {
        const { project_path, initial_branch_name = 'main' } = tool_input;

        if (!project_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameter: project_path for git_init.',
          });
        }

        // Ensure path safety
        const resolvedPath = path.resolve(project_path);
        if (!isPathSafe(project_path, resolvedPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Path safety check failed.',
          });
        }

        // Construct Git command arguments
        const gitArgs = ['init'];
        
        // Modern Git versions support -b flag for initial branch name
        if (initial_branch_name) {
          gitArgs.push('-b', initial_branch_name);
        }

        try {
          const result = await executeGitCommand(project_path, gitArgs);
          res.json(result);
        } catch (gitError: any) {
          res.status(500).json(gitError);
        }
        break;
      }

      case 'git_commit': {
        const { 
          project_path, 
          message, 
          stage_all_files = true, 
          allow_empty = false 
        } = tool_input;

        if (!project_path || !message) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and message for git_commit.',
          });
        }

        // Ensure path safety
        const resolvedPath = path.resolve(project_path);
        if (!isPathSafe(project_path, resolvedPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Path safety check failed.',
          });
        }

        try {
          // Stage all files if requested
          if (stage_all_files) {
            console.log(`[MCP Git Server] Staging all files with 'git add .'`);
            try {
              const stageResult = await executeGitCommand(project_path, ['add', '.']);
              if (!stageResult.success) {
                return res.status(500).json({
                  success: false,
                  message: 'Failed to stage files before commit.',
                  data: stageResult.data
                });
              }
            } catch (stageError: any) {
              return res.status(500).json({
                success: false,
                message: `Failed to stage files: ${stageError.message}`,
                data: stageError.data
              });
            }
          }

          // Construct commit command arguments
          const commitArgs = ['commit', '-m', message];
          
          // Add --allow-empty if requested
          if (allow_empty) {
            commitArgs.push('--allow-empty');
          }

          const result = await executeGitCommand(project_path, commitArgs);
          res.json(result);
        } catch (gitError: any) {
          res.status(500).json(gitError);
        }
        break;
      }

      case 'git_push': {
        const { 
          project_path, 
          remote_name = 'origin', 
          branch_name, 
          force_push = false, 
          set_upstream = false 
        } = tool_input;

        if (!project_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameter: project_path for git_push.',
          });
        }

        // Ensure path safety
        const resolvedPath = path.resolve(project_path);
        if (!isPathSafe(project_path, resolvedPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Path safety check failed.',
          });
        }

        try {
          // Construct push command arguments
          const pushArgs = ['push'];
          
          // Add --set-upstream if requested
          if (set_upstream) {
            pushArgs.push('-u');
          }
          
          // Add remote name
          pushArgs.push(remote_name);
          
          // Add branch name if provided
          if (branch_name) {
            pushArgs.push(branch_name);
          }
          
          // Add --force if requested
          if (force_push) {
            console.log(`[MCP Git Server] ⚠️ WARNING: Using force push!`);
            pushArgs.push('--force');
          }

          const result = await executeGitCommand(project_path, pushArgs);
          res.json(result);
        } catch (gitError: any) {
          res.status(500).json(gitError);
        }
        break;
      }

      default:
        console.warn(`[MCP Git Server] Unknown tool: ${tool_name}`);
        res.status(400).json({ 
          success: false, 
          message: `Unknown tool: ${tool_name}` 
        });
        break;
    }
  } catch (error: any) {
    console.error(`[MCP Git Server] Internal server error:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${error.message}` 
    });
  }
});

app.listen(port, () => {
  console.log(`[MCP Git Server] Listening on port ${port}`);
  console.log(`Awaiting tool calls at http://localhost:${port}/tools/call`);
});

// To run this server:
// 1. Save as mcp_server_git.ts
// 2. Install dependencies: npm install express body-parser
// 3. Compile and run: tsc mcp_server_git.ts && node mcp_server_git.js
// (Or use ts-node: npm install -g ts-node; ts-node mcp_server_git.ts)
