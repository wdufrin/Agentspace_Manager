# Gemini Enterprise Manager

A comprehensive web interface to manage Google Cloud Gemini Enterprise resources. This application provides a unified console to manage Agents, Agent Engines, Data Stores, Authorizations, and more, effectively acting as a GUI for the Discovery Engine and Vertex AI APIs.

It is built with **React**, **Vite**, and **Tailwind CSS**, and communicates directly with Google Cloud APIs using the **Google API JavaScript Client (`gapi`)**.

## Features Overview

### 🤖 Agent Management
*   **Agents Manager**: List, create, update, and delete agents. Supports toggling agent status (Enable/Disable).
*   **Chat Testing**: Built-in chat interface to test agents and assistants with streaming responses, tool visualization, and grounding metadata inspection.
*   **Project Context**: smart header with Breadcrumbs and quick project switching (Project ID/Number).

### 📚 Documentation & Help
*   **User Manual**: built-in help system with detailed feature guides and API info.
*   **API Reference**: Clear documentation of underlying API calls for each feature.

### 🏭 Agent Engines & Runtimes
*   **Available Agents**: Discover and manage backend runtimes:
    *   **Agent Engines (Vertex AI)**: View active sessions, terminate sessions, and perform direct queries.
    *   **Direct Query**: Test runtimes directly without going through the high-level Agent API.

### 🛠️ Builder & Catalog
*   **Agent Builder**: A low-code tool to generate and deploy agents.
    *   **ADK Agents**: Generates Python code (`agent.py`, `requirements.txt`) for Vertex AI Agent Engines.
        *   Supports **Google Search**, **Data Store**, **OAuth**, and **BigQuery** tools.
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
    *   Granular backup/restore for specific Agents, Data Stores, or Agent Engines.
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

## API Reference

The application communicates with several Google Cloud APIs. Below is a reference of the key resources and methods used:

### Discovery Engine API (`discoveryengine.googleapis.com`)
*   **Engines**: `GET /v1alpha/projects/{project}/locations/{location}/collections/{collection}/engines`
*   **Assistants**: `GET /v1alpha/projects/{project}/locations/{location}/collections/{collection}/engines/{engine}/assistants`
*   **Data Stores**: `GET /v1beta/projects/{project}/locations/{location}/collections/{collection}/dataStores`
*   **Conversations**: `POST /v1beta/projects/{project}/locations/{location}/collections/{collection}/dataStores/{dataStore}/conversations`

### Vertex AI API (`aiplatform.googleapis.com`)
*   **Reasoning Engines**: `GET /v1beta1/projects/{project}/locations/{location}/reasoningEngines`
*   **Chat Completions**: `POST /v1beta1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent` (for Gemini models)

### Service Usage API (`serviceusage.googleapis.com`)
*   **Services**: `GET /v1/projects/{project}/services` (Used to validate enabled APIs on startup)

### IAM API (`iam.googleapis.com`)
*   **Permissions**: `POST /v1/projects/{project}:testIamPermissions` (Used to check service account permissions)

