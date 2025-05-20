// mcp_server_filesystem.ts
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const port = process.env.MCP_FILESYSTEM_PORT || 3002;

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

// POST /tools/call endpoint
app.post('/tools/call', async (req: Request, res: Response) => {
  const { tool_name, tool_input } = req.body as ToolCallRequestBody;

  console.log(`[MCP Filesystem Server] Received tool call for: ${tool_name}`, tool_input);

  try {
    switch (tool_name) {
      case 'read_file': {
        const { project_path, file_path, encoding = 'utf8' } = tool_input;

        if (!project_path || !file_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and file_path for read_file.',
          });
        }

        const fullPath = path.join(path.resolve(project_path), file_path);
        
        // Ensure path safety
        if (!isPathSafe(project_path, fullPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Attempted to access a file outside the project directory.',
          });
        }

        try {
          const fileContent = await fs.readFile(fullPath, encoding as BufferEncoding);
          console.log(`[MCP Filesystem Server] Successfully read file: ${file_path}`);
          
          res.json({
            success: true,
            data: { content: fileContent }
          });
        } catch (fileError: any) {
          console.error(`[MCP Filesystem Server] Error reading file ${file_path}:`, fileError);
          res.status(404).json({
            success: false,
            message: `Failed to read file: ${fileError.message}`,
          });
        }
        break;
      }

      case 'write_file': {
        const { project_path, file_path, content, encoding = 'utf8' } = tool_input;

        if (!project_path || !file_path || content === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path, file_path, and content for write_file.',
          });
        }

        const fullPath = path.join(path.resolve(project_path), file_path);
        
        // Ensure path safety
        if (!isPathSafe(project_path, fullPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Attempted to write a file outside the project directory.',
          });
        }

        try {
          // Create parent directories if they don't exist
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          
          // Write the file
          await fs.writeFile(fullPath, content, encoding as BufferEncoding);
          console.log(`[MCP Filesystem Server] Successfully wrote file: ${file_path}`);
          
          res.json({
            success: true,
            message: 'File written successfully',
            data: { file_path }
          });
        } catch (fileError: any) {
          console.error(`[MCP Filesystem Server] Error writing file ${file_path}:`, fileError);
          res.status(500).json({
            success: false,
            message: `Failed to write file: ${fileError.message}`,
          });
        }
        break;
      }

      case 'list_directory': {
        const { project_path, directory_path = '.', recursive = false } = tool_input;

        if (!project_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameter: project_path for list_directory.',
          });
        }

        const fullPath = path.join(path.resolve(project_path), directory_path);
        
        // Ensure path safety
        if (!isPathSafe(project_path, fullPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Attempted to list a directory outside the project directory.',
          });
        }

        try {
          if (recursive) {
            // Implement recursive directory listing
            const entries: string[] = [];
            
            async function readDirRecursive(dirPath: string, relativePath: string = '') {
              const items = await fs.readdir(dirPath, { withFileTypes: true });
              
              for (const item of items) {
                const itemRelativePath = path.join(relativePath, item.name);
                entries.push(itemRelativePath);
                
                if (item.isDirectory()) {
                  await readDirRecursive(path.join(dirPath, item.name), itemRelativePath);
                }
              }
            }
            
            await readDirRecursive(fullPath);
            console.log(`[MCP Filesystem Server] Successfully listed directory (recursive): ${directory_path}`);
            
            res.json({
              success: true,
              data: { entries }
            });
          } else {
            // Non-recursive listing
            const items = await fs.readdir(fullPath);
            console.log(`[MCP Filesystem Server] Successfully listed directory: ${directory_path}`);
            
            res.json({
              success: true,
              data: { entries: items }
            });
          }
        } catch (dirError: any) {
          console.error(`[MCP Filesystem Server] Error listing directory ${directory_path}:`, dirError);
          res.status(404).json({
            success: false,
            message: `Failed to list directory: ${dirError.message}`,
          });
        }
        break;
      }

      case 'create_directory': {
        const { project_path, directory_path } = tool_input;

        if (!project_path || !directory_path) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_path and directory_path for create_directory.',
          });
        }

        const fullPath = path.join(path.resolve(project_path), directory_path);
        
        // Ensure path safety
        if (!isPathSafe(project_path, fullPath)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Attempted to create a directory outside the project directory.',
          });
        }

        try {
          await fs.mkdir(fullPath, { recursive: true });
          console.log(`[MCP Filesystem Server] Successfully created directory: ${directory_path}`);
          
          res.json({
            success: true,
            message: 'Directory created successfully',
            data: { directory_path }
          });
        } catch (dirError: any) {
          console.error(`[MCP Filesystem Server] Error creating directory ${directory_path}:`, dirError);
          res.status(500).json({
            success: false,
            message: `Failed to create directory: ${dirError.message}`,
          });
        }
        break;
      }

      default:
        console.warn(`[MCP Filesystem Server] Unknown tool: ${tool_name}`);
        res.status(400).json({ 
          success: false, 
          message: `Unknown tool: ${tool_name}` 
        });
        break;
    }
  } catch (error: any) {
    console.error(`[MCP Filesystem Server] Internal server error:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Internal server error: ${error.message}` 
    });
  }
});

app.listen(port, () => {
  console.log(`[MCP Filesystem Server] Listening on port ${port}`);
  console.log(`Awaiting tool calls at http://localhost:${port}/tools/call`);
});

// To run this server:
// 1. Save as mcp_server_filesystem.ts
// 2. Install dependencies: npm install express body-parser
// 3. Compile and run: tsc mcp_server_filesystem.ts && node mcp_server_filesystem.js
// (Or use ts-node: npm install -g ts-node; ts-node mcp_server_filesystem.ts)
