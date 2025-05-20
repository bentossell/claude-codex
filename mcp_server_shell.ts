// mcp_server_shell.ts
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { exec } from 'child_process';
import path from 'path';

const app = express();
const port = process.env.MCP_SHELL_PORT || 3003;

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

// Helper function to execute shell commands
function executeShellCommand(
  projectPath: string, 
  command: string, 
  workingDir: string = '.', 
  envVars: NodeJS.ProcessEnv = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const resolvedProjectPath = path.resolve(projectPath);
    const resolvedWorkingDir = path.resolve(resolvedProjectPath, workingDir);
    
    // Ensure the working directory is within the project path (security check)
    if (!isPathSafe(resolvedProjectPath, resolvedWorkingDir)) {
      reject({
        success: false,
        message: 'Access denied: Attempted to execute a command outside the project directory.',
        data: { stdout: '', stderr: 'Path safety check failed', exitCode: 1 }
      });
      return;
    }
    
    console.log(`[MCP Shell Server] Executing command: ${command}`);
    console.log(`[MCP Shell Server] Working directory: ${resolvedWorkingDir}`);
    
    // Execute the command
    exec(command, { 
      cwd: resolvedWorkingDir, 
      env: { ...process.env, ...envVars } 
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[MCP Shell Server] Command execution error: ${error.message}`);
        reject({
          success: false,
          message: `Command execution failed: ${error.message}`,
          data: { stdout, stderr, exitCode: error.code || 1 }
        });
      } else {
        console.log(`[MCP Shell Server] Command executed successfully`);
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

  console.log(`[MCP Shell Server] Received tool call for: ${tool_name}`, tool_input);

  try {
    switch (tool_name) {
      case 'shell_run': {
        const { project_path, command, working_directory = '.', env_vars = {} } = tool_input;

        if (!project_path || !command) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and command for shell_run.',
          });
        }

        // SECURITY WARNING: This executes arbitrary commands!
        console.log(`[MCP Shell Server] ⚠️ SECURITY WARNING: Executing arbitrary command: ${command}`);
        
        try {
          const result = await executeShellCommand(project_path, command, working_directory, env_vars);
          res.json(result);
        } catch (execError: any) {
          res.status(500).json(execError);
        }
        break;
      }

      case 'add_dependency_shell': {
        const { project_path, command, working_directory = '.' } = tool_input;

        if (!project_path || !command) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and command for add_dependency_shell.',
          });
        }

        try {
          const result = await executeShellCommand(project_path, command, working_directory);
          res.json(result);
        } catch (execError: any) {
          res.status(500).json(execError);
        }
        break;
      }

      case 'run_linter': {
        const { project_path, command, working_directory = '.', auto_fix = false } = tool_input;

        if (!project_path || !command) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and command for run_linter.',
          });
        }

        if (auto_fix) {
          console.log(`[MCP Shell Server] Running linter with auto-fix enabled.`);
        }

        try {
          const result = await executeShellCommand(project_path, command, working_directory);
          res.json(result);
        } catch (execError: any) {
          res.status(500).json(execError);
        }
        break;
      }

      case 'run_tests': {
        const { project_path, command, working_directory = '.', coverage = false } = tool_input;

        if (!project_path || !command) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and command for run_tests.',
          });
        }

        if (coverage) {
          console.log(`[MCP Shell Server] Running tests with coverage enabled.`);
        }

        try {
          const result = await executeShellCommand(project_path, command, working_directory);
          res.json(result);
        } catch (execError: any) {
          res.status(500).json(execError);
        }
        break;
      }

      default:
        console.warn(`[MCP Shell Server] Unknown tool: ${tool_name}`);
        res.status(400).json({ 
          success: false, 
          message: `Unknown tool: ${tool_name}` 
        });
        break;
    }
  } catch (error: any) {
    console.error(`[MCP Shell Server] Internal server error:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${error.message}` 
    });
  }
});

app.listen(port, () => {
  console.log(`[MCP Shell Server] Listening on port ${port}`);
  console.log(`Awaiting tool calls at http://localhost:${port}/tools/call`);
  console.log(`⚠️ SECURITY WARNING: This server can execute arbitrary shell commands. Use with caution!`);
});

// To run this server:
// 1. Save as mcp_server_shell.ts
// 2. Install dependencies: npm install express body-parser
// 3. Compile and run: tsc mcp_server_shell.ts && node mcp_server_shell.js
// (Or use ts-node: npm install -g ts-node; ts-node mcp_server_shell.ts)
