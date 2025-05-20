// mcp_server_observability.ts
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { exec } from 'child_process';
import path from 'path';

const app = express();
const port = process.env.MCP_OBSERVABILITY_PORT || 3007;

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
  projectPath: string | undefined, 
  command: string, 
  envVars: NodeJS.ProcessEnv = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    // If projectPath is provided, resolve it and ensure it's safe
    // Otherwise, use the current working directory
    const cwd = projectPath ? path.resolve(projectPath) : process.cwd();
    
    if (projectPath && !isPathSafe(projectPath, cwd)) {
      reject({
        success: false,
        message: 'Access denied: Path safety check failed',
        data: { stdout: '', stderr: 'Path safety check failed', exitCode: 1 }
      });
      return;
    }
    
    console.log(`[MCP Observability Server] Executing command: ${command}`);
    console.log(`[MCP Observability Server] Working directory: ${cwd}`);
    
    // Execute the command
    exec(command, { 
      cwd, 
      env: { ...process.env, ...envVars } 
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[MCP Observability Server] Command execution error: ${error.message}`);
        reject({
          success: false,
          message: `Command execution failed: ${error.message}`,
          data: { stdout, stderr, exitCode: error.code || 1 }
        });
      } else {
        console.log(`[MCP Observability Server] Command executed successfully`);
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

  console.log(`[MCP Observability Server] Received tool call for: ${tool_name}`, tool_input);

  try {
    switch (tool_name) {
      case 'tail_logs': {
        const { 
          service_identifier, 
          log_source_type, 
          project_path, 
          lines = 100, 
          follow = false, 
          raw_cli_command 
        } = tool_input;

        if (!service_identifier || !log_source_type) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: service_identifier and log_source_type for tail_logs.',
          });
        }

        // Construct the command based on log_source_type
        let command = '';
        
        if (follow) {
          console.log(`[MCP Observability Server] Note: Continuous log streaming (follow=true) is simulated by fetching recent logs for now.`);
          console.log(`[MCP Observability Server] In a production implementation, this would require a more complex streaming mechanism.`);
        }
        
        switch (log_source_type) {
          case 'fly':
            command = `flyctl logs --app ${service_identifier} -n ${lines}`;
            if (follow) {
              // In a real implementation, this would be 'flyctl logs --app X -f'
              // But we're simulating by just getting more lines
              command = `flyctl logs --app ${service_identifier} -n ${lines * 2}`;
            }
            break;
            
          case 'vercel':
            command = `vercel logs ${service_identifier} --lines ${lines}`;
            // Vercel CLI might need project linking or project_path
            break;
            
          case 'docker':
            command = `docker logs --tail ${lines} ${service_identifier}`;
            if (follow) {
              // In a real implementation, this would be 'docker logs --tail X -f CONTAINER'
              // But we're simulating
              command = `docker logs --tail ${lines * 2} ${service_identifier}`;
            }
            break;
            
          case 'generic_cli':
            if (!raw_cli_command) {
              return res.status(400).json({
                success: false,
                message: 'Missing required parameter: raw_cli_command for log_source_type "generic_cli".',
              });
            }
            command = raw_cli_command;
            break;
            
          default:
            return res.status(400).json({
              success: false,
              message: `Unsupported log_source_type: ${log_source_type}`,
            });
        }
        
        try {
          const result = await executeShellCommand(project_path, command);
          res.json(result);
        } catch (execError: any) {
          res.status(500).json(execError);
        }
        break;
      }

      case 'view_metrics': {
        const { 
          service_identifier, 
          metrics_source_type, 
          project_path, 
          metrics_queries = [], 
          time_range_start, 
          time_range_end, 
          raw_cli_command 
        } = tool_input;

        if (!service_identifier || !metrics_source_type) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: service_identifier and metrics_source_type for view_metrics.',
          });
        }

        // Construct the command based on metrics_source_type
        let command = '';
        let simulatedResponse = false;
        let simulatedMessage = '';
        
        switch (metrics_source_type) {
          case 'fly':
            // This is a simplification; Fly.io might have more specific metrics commands
            command = `flyctl metrics dashboard --app ${service_identifier}`;
            break;
            
          case 'vercel':
            // Vercel doesn't have a direct CLI for metrics; this would typically be API-based
            simulatedResponse = true;
            simulatedMessage = "Metrics for Vercel projects are typically viewed on their dashboard. No direct CLI output available for this simulation.";
            break;
            
          case 'docker':
            command = `docker stats --no-stream ${service_identifier}`;
            break;
            
          case 'prometheus':
            // Querying Prometheus would require direct HTTP API calls
            simulatedResponse = true;
            simulatedMessage = "Querying Prometheus would require direct HTTP API calls to the Prometheus server with specific queries.";
            if (metrics_queries.length > 0) {
              simulatedMessage += ` Requested queries: ${metrics_queries.join(', ')}`;
            }
            if (time_range_start && time_range_end) {
              simulatedMessage += ` Time range: ${time_range_start} to ${time_range_end}`;
            }
            break;
            
          case 'generic_cli':
            if (!raw_cli_command) {
              return res.status(400).json({
                success: false,
                message: 'Missing required parameter: raw_cli_command for metrics_source_type "generic_cli".',
              });
            }
            command = raw_cli_command;
            break;
            
          default:
            return res.status(400).json({
              success: false,
              message: `Unsupported metrics_source_type: ${metrics_source_type}`,
            });
        }
        
        if (simulatedResponse) {
          // For cases where we're simulating a response (no actual CLI command)
          res.json({
            success: true,
            data: { 
              stdout: simulatedMessage,
              stderr: '',
              exitCode: 0
            }
          });
        } else {
          try {
            const result = await executeShellCommand(project_path, command);
            res.json(result);
          } catch (execError: any) {
            res.status(500).json(execError);
          }
        }
        break;
      }

      default:
        console.warn(`[MCP Observability Server] Unknown tool: ${tool_name}`);
        res.status(400).json({ 
          success: false, 
          message: `Unknown tool: ${tool_name}` 
        });
        break;
    }
  } catch (error: any) {
    console.error(`[MCP Observability Server] Internal server error:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${error.message}` 
    });
  }
});

app.listen(port, () => {
  console.log(`[MCP Observability Server] Listening on port ${port}`);
  console.log(`Awaiting tool calls at http://localhost:${port}/tools/call`);
  console.log(`NOTE: This server provides simplified CLI interactions for observability tools.`);
  console.log(`      For 'tail_logs' with follow=true, a real implementation would require`);
  console.log(`      a streaming mechanism (e.g., WebSockets) rather than a simple HTTP response.`);
  console.log(`      Some metrics sources like Vercel and Prometheus would typically use APIs`);
  console.log(`      rather than CLI commands in a production implementation.`);
});

// To run this server:
// 1. Save as mcp_server_observability.ts
// 2. Install dependencies: npm install express body-parser
// 3. Compile and run: tsc mcp_server_observability.ts && node mcp_server_observability.js
// (Or use ts-node: npm install -g ts-node; ts-node mcp_server_observability.ts)
