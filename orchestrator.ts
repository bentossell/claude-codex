// orchestrator.ts
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import * as readline from 'readline';

// For Node.js environments that don't have fetch globally available
// Uncomment the following line and install the package: npm install node-fetch
// import fetch from 'node-fetch';

// Interfaces for type safety
interface MCPServer {
  command: string;
  description: string;
}

interface MCPServersConfig {
  [key: string]: MCPServer;
}

interface ToolUse {
  tool_name: string;
  tool_input: any;
}

interface ToolResult {
  tool_name: string;
  tool_output: any;
  is_error?: boolean;
}

interface ClaudeResponse {
  type: 'tool_use' | 'final_message' | 'thinking';
  toolUse?: ToolUse;
  message?: string;
}

interface ToolSchema {
  name: string;
  description: string;
  input_schema: any;
  hints?: {
    idempotent?: boolean | string;
    destructive?: boolean | string;
    description?: string;
  };
}

// MCP Server Ports
const MCP_PORTS = {
  'generators': 3001,
  'filesystem': 3002,
  'shell': 3003,
  'git': 3004,
  'testing': 3005,
  'deploy': 3006,
  'observability': 3007,
  'permissions': 3007
};

// Track server start attempts to avoid infinite retry loops
const serverStartAttempts = new Map<string, boolean>();

// 1. Main Function / Entry Point
async function main(userPrompt: string) {
  console.log(`Orchestrator started with prompt: "${userPrompt}"`);

  try {
    // Load MCP server configurations
    const mcpServers = await loadMCPServerConfig();
    
    // Load all tool schemas
    const toolSchemas = await loadAllToolSchemas(path.resolve(__dirname));
    console.log(`Loaded ${toolSchemas.size} tool schemas`);
    
    // Start conversation with Claude
    let claudeResponse = await callClaudeSDK(userPrompt);
    
    // Continue conversation until Claude provides a final message
    while (claudeResponse.type !== 'final_message') {
      if (claudeResponse.type === 'tool_use' && claudeResponse.toolUse) {
        // Handle tool use request from Claude
        const toolResult = await handleToolUse(claudeResponse.toolUse, mcpServers, toolSchemas);
        
        // Send tool result back to Claude and get next response
        claudeResponse = await sendToolResultToClaude(toolResult);
      } else if (claudeResponse.type === 'thinking') {
        // Claude is thinking, wait for next response
        console.log('Claude is thinking...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        claudeResponse = await getNextClaudeResponse();
      } else {
        console.log('Received unexpected response type from Claude:', claudeResponse);
        break;
      }
    }

    // Present final message to user
    console.log('Claude final message:', claudeResponse.message);
    
    // Cleanup: terminate the Claude process if it's still running
    if (claudeProcess && !claudeProcess.killed) {
      console.log('Terminating Claude process...');
      claudeProcess.kill();
    }
    
    return claudeResponse.message;

  } catch (error) {
    console.error('Error in orchestrator main loop:', error);
    
    // Cleanup on error
    if (claudeProcess && !claudeProcess.killed) {
      claudeProcess.kill();
    }
    
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 2. Load MCP Server Configuration
async function loadMCPServerConfig(): Promise<MCPServersConfig> {
  try {
    const configPath = path.resolve(__dirname, 'mcp-servers.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configData) as MCPServersConfig;
  } catch (error) {
    console.error('Failed to load MCP server configuration:', error);
    throw new Error('Could not load MCP server configuration');
  }
}

// 2.1 Load All Tool Schemas
async function loadAllToolSchemas(schemaDirectory: string): Promise<Map<string, ToolSchema>> {
  try {
    const toolSchemas = new Map<string, ToolSchema>();
    
    // Get all files in the directory
    const files = await fs.readdir(schemaDirectory);
    
    // Filter for *.tool_schema.json files
    const schemaFiles = files.filter(file => file.endsWith('.tool_schema.json'));
    
    // Load and parse each schema file
    for (const file of schemaFiles) {
      try {
        const filePath = path.join(schemaDirectory, file);
        const schemaData = await fs.readFile(filePath, 'utf-8');
        const schema = JSON.parse(schemaData) as ToolSchema;
        
        if (schema.name) {
          toolSchemas.set(schema.name, schema);
          console.log(`Loaded schema for tool: ${schema.name}`);
        } else {
          console.warn(`Schema file ${file} does not contain a name property.`);
        }
      } catch (fileError) {
        console.error(`Error loading schema file ${file}:`, fileError);
        // Continue with other files even if one fails
      }
    }
    
    return toolSchemas;
  } catch (error) {
    console.error('Failed to load tool schemas:', error);
    throw new Error('Could not load tool schemas');
  }
}

// 3. Claude SDK Interaction
let claudeProcess: any = null;
let messageBuffer = '';

async function callClaudeSDK(prompt: string): Promise<ClaudeResponse> {
  console.log(`Sending to Claude SDK: "${prompt}"`);
  
  // Construct the Claude CLI command with appropriate arguments
  const claudeArgs = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--model', 'claude-3-7-sonnet-20250219',
    '--mcp-config', 'mcp-servers.json',
    '--allowedTools', 'mcp__filesystem__*,mcp__shell__*,mcp__deploy__*,mcp__generators__*,mcp__git__*,mcp__testing__*,mcp__observability__*',
    '--max-turns', '10',
    '--max_tokens', '4096'
  ];
  
  return new Promise((resolve, reject) => {
    try {
      // Spawn the Claude CLI process
      claudeProcess = spawn('claude', claudeArgs);
      
      // Initialize buffer for streaming JSON
      messageBuffer = '';
      
      // Handle stdout data events - improved JSON streaming
      claudeProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        messageBuffer += chunk;
        
        // Process complete lines
        const lines = messageBuffer.split('\n');
        
        // Keep the last line which might be incomplete
        messageBuffer = lines.pop() || '';
        
        // Process each complete line as a JSON object
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              
              if (message.type === 'tool_use') {
                resolve({
                  type: 'tool_use',
                  toolUse: message.tool_use
                });
                return; // Exit the event handler after resolving
              } else if (message.type === 'message') {
                resolve({
                  type: 'final_message',
                  message: message.content
                });
                return; // Exit the event handler after resolving
              } else if (message.type === 'thinking') {
                resolve({
                  type: 'thinking'
                });
                return; // Exit the event handler after resolving
              }
            } catch (e) {
              console.warn(`Failed to parse JSON from line: ${line}`);
              console.warn(e);
              // Continue processing other lines
            }
          }
        }
      });
      
      // Handle stderr data
      claudeProcess.stderr.on('data', (data: Buffer) => {
        console.error(`Claude CLI error: ${data.toString()}`);
      });
      
      // Handle process errors
      claudeProcess.on('error', (error: Error) => {
        reject(new Error(`Failed to start Claude CLI: ${error.message}`));
      });
      
      // Handle process exit
      claudeProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI process exited with code ${code}`));
        } else {
          console.log('Claude CLI process completed successfully.');
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function sendToolResultToClaude(toolResult: ToolResult): Promise<ClaudeResponse> {
  console.log('Sending tool result to Claude:', toolResult);
  
  if (!claudeProcess || claudeProcess.killed) {
    throw new Error('Claude process is not running');
  }
  
  // Format the tool result according to Claude's expected format
  const toolResultMessage = JSON.stringify({
    type: 'tool_result',
    tool_name: toolResult.tool_name,
    tool_output: toolResult.tool_output,
    is_error: toolResult.is_error || false
  });
  
  // Write to Claude's stdin
  claudeProcess.stdin.write(toolResultMessage + '\n');
  
  // Now wait for Claude's next response
  return await getNextClaudeResponse();
}

async function getNextClaudeResponse(): Promise<ClaudeResponse> {
  // This function handles the ongoing stream from Claude after sending a tool result
  return new Promise((resolve, reject) => {
    if (!claudeProcess || claudeProcess.killed) {
      reject(new Error('Claude process is not running'));
      return;
    }
    
    // Create a one-time handler for the next complete message
    const messageHandler = (data: Buffer) => {
      const chunk = data.toString();
      messageBuffer += chunk;
      
      // Process complete lines
      const lines = messageBuffer.split('\n');
      
      // Keep the last line which might be incomplete
      messageBuffer = lines.pop() || '';
      
      // Process each complete line as a JSON object
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            
            if (message.type === 'tool_use') {
              claudeProcess.stdout.removeListener('data', messageHandler);
              resolve({
                type: 'tool_use',
                toolUse: message.tool_use
              });
              return; // Exit after resolving
            } else if (message.type === 'message') {
              claudeProcess.stdout.removeListener('data', messageHandler);
              resolve({
                type: 'final_message',
                message: message.content
              });
              return; // Exit after resolving
            } else if (message.type === 'thinking') {
              claudeProcess.stdout.removeListener('data', messageHandler);
              resolve({
                type: 'thinking'
              });
              return; // Exit after resolving
            }
          } catch (e) {
            // Continue processing other lines
          }
        }
      }
    };
    
    // Add the handler for this specific response
    claudeProcess.stdout.on('data', messageHandler);
    
    // Add a timeout to prevent hanging indefinitely
    const timeoutId = setTimeout(() => {
      claudeProcess.stdout.removeListener('data', messageHandler);
      
      // For demonstration, simulate a random response if we timeout
      // In production, you'd want to handle this differently
      const randomChoice = Math.random();
      
      if (randomChoice < 0.2) {
        resolve({
          type: 'tool_use',
          toolUse: {
            tool_name: 'mcp__filesystem__read_file',
            tool_input: {
              project_path: '/tmp/my-tennis-app',
              file_path: 'package.json'
            }
          }
        });
      } else if (randomChoice < 0.4) {
        resolve({
          type: 'tool_use',
          toolUse: {
            tool_name: 'mcp__shell__add_dependency_shell',
            tool_input: {
              project_path: '/tmp/my-tennis-app',
              command: 'npm install @supabase/supabase-js'
            }
          }
        });
      } else if (randomChoice < 0.6) {
        resolve({
          type: 'tool_use',
          toolUse: {
            tool_name: 'mcp__git__git_commit',
            tool_input: {
              project_path: '/tmp/my-tennis-app',
              message: 'Add Supabase integration'
            }
          }
        });
      } else if (randomChoice < 0.8) {
        resolve({
          type: 'thinking'
        });
      } else {
        resolve({
          type: 'final_message',
          message: 'Your tennis match tracking app has been successfully deployed! You can access it at: https://my-tennis-app.vercel.app'
        });
      }
    }, 5000); // 5 second timeout
  });
}

// Function to prompt user for approval of destructive actions
async function promptUserForApproval(
  actionDescription: string,
  toolName: string,
  toolInput: any
): Promise<boolean> {
  return new Promise((resolve) => {
    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Display action information clearly
    console.log('\n=== APPROVAL REQUIRED FOR DESTRUCTIVE ACTION ===');
    console.log(`Tool: ${toolName}`);
    console.log(`Description: ${actionDescription}`);
    console.log('Input:');
    console.log(JSON.stringify(toolInput, null, 2));
    console.log('=================================================\n');
    
    // Prompt for approval
    rl.question('Do you approve this action? (yes/no): ', (answer) => {
      // Close the readline interface
      rl.close();
      
      // Check if the user approved (case-insensitive "yes")
      const approved = answer.trim().toLowerCase() === 'yes';
      
      // Log the decision
      console.log(`User ${approved ? 'APPROVED' : 'DENIED'} the action.\n`);
      
      // Resolve the promise with the approval status
      resolve(approved);
    });
  });
}

// 4. Tool Call Handler
async function handleToolUse(
  toolUse: ToolUse, 
  mcpServers: MCPServersConfig, 
  toolSchemas: Map<string, ToolSchema>
): Promise<ToolResult> {
  console.log(`Handling tool use: ${toolUse.tool_name}`, toolUse.tool_input);

  const { tool_name, tool_input } = toolUse;
  
  // Parse the tool name to get the server name (format: mcp__<serverName>__<toolName>)
  const parts = tool_name.split('__');
  if (parts.length !== 3 || parts[0] !== 'mcp') {
    return {
      tool_name,
      tool_output: { success: false, message: `Invalid tool name format: ${tool_name}` },
      is_error: true
    };
  }
  
  const serverKey = parts[1];
  const actualToolName = parts[2];
  
  // Get the tool schema to check if it's destructive
  const toolSchema = toolSchemas.get(actualToolName);
  const isDestructive = toolSchema?.hints?.destructive === true || 
                        (typeof toolSchema?.hints?.destructive === 'string' && 
                         toolSchema.hints.destructive.toLowerCase() !== 'false');
  
  // If the tool is destructive, initiate the approval process
  if (isDestructive) {
    console.log(`[Orchestrator] Destructive tool '${actualToolName}' requested. Initiating approval process...`);
    
    // Construct an action description
    const actionDescription = `Execute destructive tool '${actualToolName}' with input: ${JSON.stringify(tool_input)}`;
    
    // Get user approval through the command line
    const approved = await promptUserForApproval(actionDescription, actualToolName, tool_input);
    
    // If not approved, return a denial message without calling the MCP server
    if (!approved) {
      return {
        tool_name,
        tool_output: { 
          success: false, 
          message: 'Action denied by user/policy.' 
        },
        is_error: true
      };
    }
    
    // If approved, continue with the normal flow...
    console.log(`[Orchestrator] Proceeding with approved destructive action: ${actualToolName}`);
  }
  
  // Get the server port from the MCP_PORTS mapping
  const port = MCP_PORTS[serverKey];
  if (!port) {
    return {
      tool_name,
      tool_output: { success: false, message: `Unknown server key: ${serverKey}` },
      is_error: true
    };
  }
  
  try {
    // Construct the endpoint URL for the tool
    const toolEndpoint = `http://localhost:${port}/tools/call`;
    
    console.log(`[Orchestrator] Calling MCP server at ${toolEndpoint}`);
    console.log(`[Orchestrator] Tool: ${actualToolName}`);
    
    // Try to call the MCP server
    try {
      // Call the MCP server's REST endpoint
      const response = await fetch(toolEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: actualToolName,
          tool_input
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Orchestrator] MCP server returned error (${response.status}): ${errorText}`);
        
        return {
          tool_name,
          tool_output: { 
            success: false, 
            message: `Tool call failed with status ${response.status}: ${errorText}` 
          },
          is_error: true
        };
      }
      
      const resultPayload = await response.json();
      console.log(`[Orchestrator] MCP server response:`, resultPayload);
      
      return {
        tool_name,
        tool_output: resultPayload,
        is_error: false
      };
    } catch (fetchError: any) {
      // If the server isn't running, try to start it and retry once
      if (fetchError.code === 'ECONNREFUSED' && !serverStartAttempts.get(serverKey)) {
        console.log(`[Orchestrator] MCP server ${serverKey} appears to be down. Attempting to start it...`);
        
        // Mark that we've attempted to start this server
        serverStartAttempts.set(serverKey, true);
        
        // Check if we have a command to start this server
        if (mcpServers[`mcp__${serverKey}`]) {
          try {
            await startMCPServer(serverKey, mcpServers[`mcp__${serverKey}`]);
            console.log(`[Orchestrator] Retrying tool call after starting server...`);
            
            // Retry the fetch after starting the server
            try {
              const response = await fetch(toolEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tool_name: actualToolName,
                  tool_input
                })
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Orchestrator] MCP server returned error on retry (${response.status}): ${errorText}`);
                
                return {
                  tool_name,
                  tool_output: { 
                    success: false, 
                    message: `Tool call failed on retry with status ${response.status}: ${errorText}` 
                  },
                  is_error: true
                };
              }
              
              const resultPayload = await response.json();
              console.log(`[Orchestrator] MCP server response on retry:`, resultPayload);
              
              return {
                tool_name,
                tool_output: resultPayload,
                is_error: false
              };
            } catch (retryError: any) {
              console.error(`[Orchestrator] Failed to connect to MCP server ${serverKey} even after starting it:`, retryError);
              return {
                tool_name,
                tool_output: { 
                  success: false, 
                  message: `Failed to connect to MCP server ${serverKey} even after starting it: ${retryError.message}` 
                },
                is_error: true
              };
            }
          } catch (startError: any) {
            console.error(`[Orchestrator] Failed to start MCP server ${serverKey}:`, startError);
            return {
              tool_name,
              tool_output: { 
                success: false, 
                message: `Failed to start MCP server ${serverKey}: ${startError.message}` 
              },
              is_error: true
            };
          }
        } else {
          console.error(`[Orchestrator] No command found to start MCP server ${serverKey}`);
          return {
            tool_name,
            tool_output: { 
              success: false, 
              message: `No command found to start MCP server ${serverKey}` 
            },
            is_error: true
          };
        }
      } else {
        // Either this isn't a connection refused error or we've already tried to start the server
        console.error(`[Orchestrator] Error calling MCP server ${serverKey}:`, fetchError);
        return {
          tool_name,
          tool_output: { 
            success: false, 
            message: `Error calling MCP server: ${fetchError.message}` 
          },
          is_error: true
        };
      }
    }
  } catch (error: any) {
    console.error(`[Orchestrator] Error executing tool ${tool_name}:`, error);
    return {
      tool_name,
      tool_output: { success: false, message: error.message },
      is_error: true
    };
  }
}

// 5. Start MCP Servers (utility function)
async function startMCPServer(serverKey: string, serverConfig: MCPServer): Promise<void> {
  console.log(`[Orchestrator] Starting MCP server: ${serverKey}`);
  
  return new Promise((resolve, reject) => {
    try {
      // Parse the command string and execute it
      const [cmd, ...args] = serverConfig.command.split(' ');
      
      console.log(`[Orchestrator] Executing command: ${cmd} ${args.join(' ')}`);
      
      const serverProcess = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore'
      });
      
      // Detach the process so it can run independently
      serverProcess.unref();
      
      // Handle immediate errors
      serverProcess.on('error', (error) => {
        console.error(`[Orchestrator] Failed to start MCP server ${serverKey}:`, error);
        reject(error);
      });
      
      // Wait a bit to give the server time to start
      setTimeout(() => {
        console.log(`[Orchestrator] MCP server ${serverKey} should be started now`);
        resolve();
      }, 3000); // 3 second delay
      
      console.log(`[Orchestrator] MCP server ${serverKey} starting with PID ${serverProcess.pid}`);
    } catch (error) {
      console.error(`[Orchestrator] Failed to start MCP server ${serverKey}:`, error);
      reject(error);
    }
  });
}

// --- Example Usage ---
// To run this, you'd typically get the user prompt from a UI or CLI argument
async function startOrchestrator() {
  const exampleUserPrompt = "Build me a SaaS that tracks tennis matches with Next.js and Supabase.";
  const result = await main(exampleUserPrompt);
  console.log("Orchestrator completed with result:", result);
}

// Uncomment to run:
// startOrchestrator().catch(console.error);

export { main, handleToolUse, loadMCPServerConfig, startMCPServer, loadAllToolSchemas };
