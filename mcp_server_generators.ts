// mcp_server_generators.ts
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { exec } from 'child_process'; // For simulating npm install
import fs from 'fs/promises';
import path from 'path';

const app = express();
const port = process.env.MCP_GENERATORS_PORT || 3001;

app.use(bodyParser.json());

interface ToolCallRequestBody {
  tool_name: string;
  tool_input: any;
}

// POST /tools/call endpoint
app.post('/tools/call', async (req: Request, res: Response) => {
  const { tool_name, tool_input } = req.body as ToolCallRequestBody;

  console.log(`[MCP Generators Server] Received tool call for: ${tool_name}`, tool_input);

  try {
    switch (tool_name) {
      case 'scaffold_app':
        const { framework, project_name, database, auth } = tool_input;

        if (!project_name || !framework) {
          return res.status(400).json({
            success: false,
            message: 'Missing required parameters: project_name and framework for scaffold_app.',
          });
        }

        const projectPath = path.resolve(process.cwd(), project_name); // Create in current working dir for simplicity

        console.log(`[MCP Generators Server] Scaffolding project: ${project_name}`);
        console.log(`  Framework: ${framework}`);
        console.log(`  Database: ${database || 'none'}`);
        console.log(`  Auth: ${auth || false}`);
        console.log(`  Project Path: ${projectPath}`);

        // Simulate directory creation
        try {
          await fs.mkdir(projectPath, { recursive: true });
          console.log(`  Created directory: ${projectPath}`);

          // Simulate file creation (e.g., a simple package.json)
          let packageJsonContent = {};
          if (framework === 'nextjs') {
            packageJsonContent = {
              name: project_name,
              version: '0.1.0',
              private: true,
              scripts: {
                dev: 'next dev',
                build: 'next build',
                start: 'next start',
                lint: 'next lint',
              },
              dependencies: {
                next: '^13.0.0', // Example version
                react: '^18.0.0',
                'react-dom': '^18.0.0',
              },
            };
          } else if (framework === 'expo') {
            packageJsonContent = {
              name: project_name,
              version: '1.0.0',
              main: 'node_modules/expo/AppEntry.js',
              scripts: {
                start: 'expo start',
                android: 'expo start --android',
                ios: 'expo start --ios',
              },
              dependencies: {
                expo: '~49.0.15', // Example version
                'expo-status-bar': '~1.6.0',
                react: '18.2.0',
                'react-native': '0.72.6',
              },
            };
          } else if (framework === 'fastapi') {
            // For FastAPI, typically you'd have main.py and requirements.txt
            await fs.writeFile(path.join(projectPath, 'main.py'), 'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/")\nasync def root():\n    return {"message": "Hello World"}\n');
            await fs.writeFile(path.join(projectPath, 'requirements.txt'), 'fastapi\nuvicorn[standard]\n');
            console.log('  Created main.py and requirements.txt for FastAPI.');
          }

          if (Object.keys(packageJsonContent).length > 0) {
             await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify(packageJsonContent, null, 2));
             console.log('  Created package.json');
          }

          // Simulate installing dependencies (conceptual)
          console.log('  Simulating dependency installation (e.g., npm install)...');
          // In a real scenario, you might run: 
          // exec('npm install', { cwd: projectPath }, (error, stdout, stderr) => { ... });
          // For FastAPI, it would be: pip install -r requirements.txt

          res.json({
            success: true,
            message: `Project ${project_name} scaffolded successfully. Framework: ${framework}.`,
            data: { project_path: projectPath },
          });
        } catch (scaffoldError: any) {
          console.error(`[MCP Generators Server] Error scaffolding project ${project_name}:`, scaffoldError);
          res.status(500).json({
            success: false,
            message: `Failed to scaffold project: ${scaffoldError.message}`,
          });
        }
        break;

      // TODO: Add cases for other generator tools if this server handles more
      // case 'generate_schema':
      //   ...
      //   break;

      default:
        console.warn(`[MCP Generators Server] Unknown tool: ${tool_name}`);
        res.status(400).json({ success: false, message: `Unknown tool: ${tool_name}` });
        break;
    }
  } catch (error: any) {
    console.error(`[MCP Generators Server] Internal server error:`, error);
    res.status(500).json({ success: false, message: `Internal server error: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`[MCP Generators Server] Listening on port ${port}`);
  console.log(`Awaiting tool calls at http://localhost:${port}/tools/call`);
});

// To run this server:
// 1. Save as mcp_server_generators.ts
// 2. Install dependencies: npm install express body-parser
// 3. Compile and run: tsc mcp_server_generators.ts && node mcp_server_generators.js
// (Or use ts-node: npm install -g ts-node; ts-node mcp_server_generators.ts)
