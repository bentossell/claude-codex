# UI Interaction Flow for Text-to-App System

## 1. Overview

The UI serves as the primary interface between the user and the Text-to-App system. It allows users to describe their application idea in natural language, observe Claude's progress as it builds the application, approve or deny potentially destructive actions, and view the final result. The UI abstracts away the complexity of the underlying orchestrator, MCP servers, and Claude interactions, providing a seamless experience for turning text prompts into working applications.

## 2. Core Interactions

### 2.1 Submitting Initial Prompt

- **Input Method**: The UI provides a prominent text input area (similar to ChatGPT or GitHub Copilot) where users can describe their desired application.
- **Example**: "Build me a SaaS that tracks tennis matches with Next.js and Supabase."
- **Optional Parameters**: The UI may offer additional fields or toggles for:
  - Technology preferences (frameworks, databases)
  - Deployment target (Vercel, Fly.io, etc.)
  - Authentication requirements
- **Submission**: A "Generate" or "Build App" button initiates the process, sending the prompt to the orchestrator.

### 2.2 Displaying Progress/Claude's Thoughts

- **Progress Indicator**: A visual indicator (spinner, progress bar) shows that Claude is processing the request.
- **Thinking Messages**: When Claude sends a `thinking` message, the UI displays this as a typing indicator or "Claude is thinking..." message.
- **Step Tracking**: The UI maintains and displays a list of high-level steps being taken:
  - "Planning application architecture..."
  - "Scaffolding Next.js project..."
  - "Setting up Supabase integration..."
- **Log View**: An expandable/collapsible detailed log view shows more technical details for advanced users.

### 2.3 Handling Approval Requests

- **Approval Modal**: When the orchestrator detects a destructive action and requests approval, the UI displays a modal dialog containing:
  - Clear description of the action requiring approval
  - Tool name and purpose
  - Specific parameters/inputs for the tool
  - Potential consequences or risks
  - "Approve" and "Deny" buttons
- **Timeout Indicator**: For actions with a timeout, a countdown timer shows remaining time before automatic denial.
- **Context Information**: The modal provides context about why this action is necessary in the overall application building process.
- **Decision Submission**: User's approval/denial is immediately sent back to the orchestrator to continue or abort the action.

### 2.4 Displaying Tool Execution Status

- **Tool Execution List**: A chronological list of tools being executed, showing:
  - Tool name and purpose
  - Status (pending, in-progress, completed, failed)
  - Execution time
  - Success/failure indicator
- **Output Display**: For important tools, relevant output is displayed (e.g., successful deployment URLs, test results).
- **Error Handling**: Failed tool executions are highlighted with error details and potential remediation steps.
- **Grouping**: Tools are visually grouped by category (scaffolding, dependency installation, deployment, etc.).

### 2.5 Presenting Final Result

- **Success Summary**: Upon completion, a summary card shows:
  - Deployment URL(s)
  - Repository link (if code was pushed to a remote repository)
  - Screenshot or preview of the application (if available)
- **Next Steps**: Actionable guidance for the user:
  - How to access the application
  - How to make further modifications
  - How to manage or monitor the application
- **Resources**: Links to relevant documentation, tutorials, or resources related to the technologies used.
- **Download/Export**: Options to download the codebase as a ZIP file or export project files.

## 3. Communication with Orchestrator

### 3.1 API Endpoints

The orchestrator exposes a REST API that the UI interacts with:

- **`POST /api/prompt`**: Submit the initial user prompt and start the process
  - Request: `{ "prompt": "Build me a tennis match tracking app...", "preferences": { ... } }`
  - Response: `{ "session_id": "abc123", "status": "started" }`

- **`GET /api/status/:session_id`**: Check the current status of a session
  - Response: `{ "status": "in_progress", "current_step": "Installing dependencies", "progress": 0.45 }`

- **`POST /api/approve/:session_id`**: Respond to an approval request
  - Request: `{ "tool_name": "git_push", "approved": true }`
  - Response: `{ "status": "continuing", "next_step": "Deploying to Vercel" }`

### 3.2 Real-time Updates

For live updates, the orchestrator provides:

- **Server-Sent Events (SSE)**: `GET /api/events/:session_id`
  - Event types:
    - `thinking`: Claude is processing
    - `tool_start`: A tool execution has started
    - `tool_complete`: A tool execution has completed
    - `approval_needed`: User approval is required
    - `completion`: Process is complete

- **Alternative: WebSocket Connection**:
  - Connect to `ws://[orchestrator-url]/ws/:session_id`
  - Bidirectional communication for both status updates and approval responses

### 3.3 Authentication & Security

- **Session-based Authentication**: Ensures only authorized users can access their sessions
- **API Keys**: For integration with other systems or headless operation
- **Rate Limiting**: Prevents abuse of the system
- **Approval Timeouts**: Configurable timeouts for approval requests to prevent indefinite waiting

## 4. Key UI Components (Conceptual)

### 4.1 Prompt Input Area

- Text input field with autocomplete/suggestions
- Technology preference toggles or dropdowns
- "Build App" button
- Examples or templates for common app types

### 4.2 Conversation/Log Display

- Split view:
  - High-level conversation with Claude (similar to ChatGPT)
  - Technical log with detailed tool execution information
- Expandable/collapsible sections for each major step
- Search functionality for large logs
- Copy button for code snippets or commands

### 4.3 Approval Modal

- Clear action description
- Visual indicators for risk level
- Context information
- Approve/Deny buttons
- Timeout countdown (if applicable)

### 4.4 Status Indicators

- Overall progress bar
- Step-by-step checklist of major milestones
- Tool execution status icons
- Real-time updates on current activity
- Estimated time remaining (when possible)

### 4.5 Result Dashboard

- Deployment information card
- Repository information card
- Application preview/screenshot
- Resource links and documentation
- Export/download options
- "Create New App" button to start over
