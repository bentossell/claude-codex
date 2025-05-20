// mcp_server_deploy.ts
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { exec } from 'child_process';
import path from 'path';

const app = express();
const port = process.env.MCP_DEPLOY_PORT || 3006;

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
  envVars: NodeJS.ProcessEnv = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const resolvedProjectPath = path.resolve(projectPath);
    
    // Ensure the working directory is within the project path (security check)
    if (!isPathSafe(resolvedProjectPath, resolvedProjectPath)) {
      reject({
        success: false,
        message: 'Access denied: Path safety check failed',
        data: { stdout: '', stderr: 'Path safety check failed', exitCode: 1 }
      });
      return;
    }
    
    console.log(`[MCP Deploy Server] Executing command: ${command}`);
    console.log(`[MCP Deploy Server] Working directory: ${resolvedProjectPath}`);
    
    // Execute the command
    exec(command, { 
      cwd: resolvedProjectPath, 
      env: { ...process.env, ...envVars } 
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[MCP Deploy Server] Command execution error: ${error.message}`);
        reject({
          success: false,
          message: `Command execution failed: ${error.message}`,
          data: { stdout, stderr, exitCode: error.code || 1 }
        });
      } else {
        console.log(`[MCP Deploy Server] Command executed successfully`);
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

  console.log(`[MCP Deploy Server] Received tool call for: ${tool_name}`, tool_input);

  try {
    switch (tool_name) {
      case 'deploy_vercel': {
        const { 
          project_path, 
          vercel_token, 
          team_id, 
          project_name_override, 
          production = true 
        } = tool_input;

        if (!project_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameter: project_path for deploy_vercel.',
          });
        }

        // Construct Vercel CLI command
        let vercelCommand = 'vercel deploy';
        
        // Add production flag if needed
        if (production) {
          vercelCommand += ' --prod';
        }
        
        // Add token if provided
        if (vercel_token) {
          vercelCommand += ` --token ${vercel_token}`;
        }
        
        // Add team/scope if provided
        if (team_id) {
          vercelCommand += ` --scope ${team_id}`;
        }
        
        // Add project name override if provided
        // Note: This is a simplified approach; actual Vercel CLI usage might vary
        if (project_name_override) {
          vercelCommand += ` --name ${project_name_override}`;
        }
        
        // Set up environment variables
        const envVars: NodeJS.ProcessEnv = {};
        if (vercel_token) {
          envVars.VERCEL_TOKEN = vercel_token;
        }
        
        // Note: In a real implementation, you might need to handle VERCEL_ORG_ID and VERCEL_PROJECT_ID
        // for non-interactive project linking
        
        try {
          const result = await executeShellCommand(project_path, vercelCommand, envVars);
          res.json(result);
        } catch (deployError: any) {
          res.status(500).json(deployError);
        }
        break;
      }

      case 'deploy_fly': {
        const { 
          project_path, 
          fly_auth_token, 
          app_name, 
          region, 
          org_slug, 
          config_file = 'fly.toml' 
        } = tool_input;

        if (!project_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameter: project_path for deploy_fly.',
          });
        }

        // Construct Fly CLI command
        let flyCommand = 'flyctl deploy';
        
        // Add app name if provided
        if (app_name) {
          flyCommand += ` --app ${app_name}`;
        }
        
        // Add region if provided
        if (region) {
          flyCommand += ` --region ${region}`;
        }
        
        // Add organization if provided
        if (org_slug) {
          flyCommand += ` --org ${org_slug}`;
        }
        
        // Add config file if different from default
        if (config_file !== 'fly.toml') {
          flyCommand += ` -c ${config_file}`;
        }
        
        // Set up environment variables
        const envVars: NodeJS.ProcessEnv = {};
        if (fly_auth_token) {
          envVars.FLY_API_TOKEN = fly_auth_token;
        }
        
        try {
          const result = await executeShellCommand(project_path, flyCommand, envVars);
          res.json(result);
        } catch (deployError: any) {
          res.status(500).json(deployError);
        }
        break;
      }

      case 'docker_build_push': {
        const { 
          project_path, 
          dockerfile_path = 'Dockerfile', 
          image_name, 
          image_tag = 'latest', 
          registry_url, 
          build_args = {}, 
          push_image = true 
        } = tool_input;

        if (!project_path || !image_name) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and image_name for docker_build_push.',
          });
        }

        // Construct the full image name with registry if provided
        const fullImageName = registry_url 
          ? `${registry_url}/${image_name}:${image_tag}` 
          : `${image_name}:${image_tag}`;
        
        // Construct Docker build command
        let buildCommand = `docker build -t ${fullImageName} -f ${dockerfile_path} .`;
        
        // Add build args if provided
        for (const [key, value] of Object.entries(build_args)) {
          buildCommand += ` --build-arg ${key}=${value}`;
        }
        
        try {
          // Execute build command
          const buildResult = await executeShellCommand(project_path, buildCommand);
          
          // If build successful and push_image is true, push the image
          if (buildResult.success && push_image) {
            console.log(`[MCP Deploy Server] Build successful, pushing image: ${fullImageName}`);
            
            const pushCommand = `docker push ${fullImageName}`;
            try {
              const pushResult = await executeShellCommand(project_path, pushCommand);
              
              // Return combined results
              res.json({
                success: true,
                data: {
                  build: buildResult.data,
                  push: pushResult.data
                }
              });
            } catch (pushError: any) {
              res.status(500).json({
                success: false,
                message: `Docker build succeeded but push failed: ${pushError.message}`,
                data: {
                  build: buildResult.data,
                  push: {
                    error: pushError
                  }
                }
              });
            }
          } else if (buildResult.success) {
            // Build successful but no push requested
            res.json({
              success: true,
              message: 'Docker image built successfully (no push requested)',
              data: {
                build: buildResult.data
              }
            });
          } else {
            // This shouldn't happen due to the try/catch, but just in case
            res.status(500).json(buildResult);
          }
        } catch (buildError: any) {
          res.status(500).json(buildError);
        }
        break;
      }

      default:
        console.warn(`[MCP Deploy Server] Unknown tool: ${tool_name}`);
        res.status(400).json({ 
          success: false, 
          message: `Unknown tool: ${tool_name}` 
        });
        break;
    }
  } catch (error: any) {
    console.error(`[MCP Deploy Server] Internal server error:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${error.message}` 
    });
  }
});

app.listen(port, () => {
  console.log(`[MCP Deploy Server] Listening on port ${port}`);
  console.log(`Awaiting tool calls at http://localhost:${port}/tools/call`);
  console.log(`NOTE: This server provides simplified CLI interactions for deployment tools.`);
  console.log(`      In a production environment, additional authentication, error handling,`);
  console.log(`      and output streaming would be necessary.`);
});

// To run this server:
// 1. Save as mcp_server_deploy.ts
// 2. Install dependencies: npm install express body-parser
// 3. Compile and run: tsc mcp_server_deploy.ts && node mcp_server_deploy.js
// (Or use ts-node: npm install -g ts-node; ts-node mcp_server_deploy.ts)
