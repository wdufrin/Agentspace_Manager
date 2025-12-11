
# Gemini Enterprise Manager

A comprehensive web interface to manage Google Cloud Gemini Enterprise resources. This application provides a unified console to manage Agents, Reasoning Engines, Data Stores, Authorizations, and more, effectively acting as a GUI for the Discovery Engine and Vertex AI APIs.

It is built with **React**, **Vite**, and **Tailwind CSS**, and communicates directly with Google Cloud APIs using the **Google API JavaScript Client (`gapi`)**.

## Features Overview

### 🤖 Agent Management
*   **Agents Manager**: List, create, update, and delete agents. Supports toggling agent status (Enable/Disable).
*   **Agent Registration**: A guided flow to register deployed **Agent-to-Agent (A2A)** services as discoverable tools within Gemini Enterprise.
*   **Chat Testing**: Built-in chat interface to test agents and assistants with streaming responses, tool visualization, and grounding metadata inspection.

### 🏭 Agent Engines & Runtimes
*   **Available Agents**: Discover and manage backend runtimes:
    *   **Reasoning Engines (Vertex AI)**: View active sessions, terminate sessions, and perform direct queries.
    *   **Cloud Run Services**: Identify services acting as A2A agents or MCP Servers.
    *   **Direct Query**: Test runtimes directly without going through the high-level Agent API.
*   **Cloud Run Agents**: AI-powered analysis of Cloud Run services to detect if they are running agentic frameworks (LangChain, Genkit, etc.).
*   **Dialogflow CX**: List and test Dialogflow CX agents within the same console.

### 🛠️ Builder & Catalog
*   **Agent Builder**: A low-code tool to generate and deploy agents.
    *   **ADK Agents**: Generates Python code (`agent.py`, `requirements.txt`) for Vertex AI Reasoning Engines.
    *   **A2A Functions**: Generates Flask-based code for Cloud Run services implementing the A2A protocol.
    *   **Cloud Build Integration**: One-click deployment to Google Cloud.
*   **Agent Catalog**: Browse sample agents from GitHub repositories and deploy them directly to your project.

### 📚 Knowledge & Data
*   **Data Stores**: Manage Vertex AI Search data stores.
    *   Create and Edit data stores with advanced parsing configuration (Digital, OCR, Layout).
    *   **Document Management**: List documents and import new files directly from your computer or Google Cloud Storage (GCS).
*   **Assistant Configuration**: Manage the default assistant's system instructions, grounding settings (Google Search), and enabled tools/actions.

### 🛡️ Security & Governance
*   **Authorizations**: Manage OAuth2 configurations for agents.
*   **Model Armor**:
    *   **Log Viewer**: Inspect sanitization logs to see what content was blocked or modified.
    *   **Policy Generator**: Create Model Armor templates to filter Hate Speech, PII, and Prompt Injection.
*   **IAM Policies**: View and edit IAM policies for specific agents directly from the UI.

### 🔧 Operations
*   **Architecture Visualizer**: An interactive node-graph visualizing the relationships between your Project, Engines, Assistants, Agents, Data Stores, and Backends.
*   **Backup & Recovery**:
    *   Full backup of Discovery Engine resources (Collections, Engines, Agents) to GCS.
    *   Granular backup/restore for specific Agents, Data Stores, or Reasoning Engines.
*   **Licenses**: Monitor user license assignments and prune inactive users.
    *   **Auto-Pruner**: Deploy a serverless job to automatically revoke licenses for users who haven't logged in for $N days.

## Setup & Configuration

### Prerequisites
*   A Google Cloud Project.
*   The following APIs enabled:
    *   `discoveryengine.googleapis.com`
    *   `aiplatform.googleapis.com`
    *   `run.googleapis.com`
    *   `cloudbuild.googleapis.com`
    *   `storage.googleapis.com`
    *   `serviceusage.googleapis.com`

### 1. Configure OAuth Consent
To use "Sign in with Google", configure an OAuth Client ID:
1.  Go to **APIs & Services > Credentials** in the Google Cloud Console.
2.  Create an **OAuth client ID** (Web application).
3.  Add the URL where this app is running to **Authorized JavaScript origins** (e.g., `http://localhost:3000` or `https://your-app.run.app`).
4.  Copy the **Client ID** and update `GOOGLE_CLIENT_ID` in `src/App.tsx`.

### 2. Run Locally
```sh
npm install
npm run dev
```

### 3. Deploy to Cloud Run
You can deploy this frontend as a static site container.

**Using Google Cloud Buildpacks (Simplest):**
```sh
gcloud run deploy gemini-manager \
  --source . \
  --project [YOUR_PROJECT_ID] \
  --region us-central1 \
  --allow-unauthenticated
```

**Using Docker:**
1.  Build the image: `docker build -t gcr.io/[PROJECT_ID]/gemini-manager .`
2.  Push: `docker push gcr.io/[PROJECT_ID]/gemini-manager`
3.  Deploy: `gcloud run deploy gemini-manager --image gcr.io/[PROJECT_ID]/gemini-manager ...`

## Usage Tips

*   **API Validation**: On first load, the app checks if required APIs are enabled. Use the "Enable APIs" button to fix missing dependencies.
*   **Access Token**: If you cannot use Google Sign-In (e.g., due to third-party cookie restrictions), you can manually paste a token generated via `gcloud auth print-access-token`.
*   **Region Selection**: Ensure you select the correct location (Global, US, EU) in the configuration bar, as Discovery Engine resources are location-specific.

## Technical Details

*   **Framework**: React 18 + Vite
*   **Styling**: Tailwind CSS
*   **State Management**: React Hooks + Session Storage
*   **Visualization**: React Flow (Architecture Graph)
*   **API Client**: `window.gapi` (Google API Client Library for JavaScript)
