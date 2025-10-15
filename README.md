# Agentspace Manager

A web interface to manage Google Cloud Agentspace resources, including agents, authorizations, and reasoning engines. This UI provides a user-friendly way to perform operations similar to the `gcloud` CLI tool for Agentspace.

## Key Features

-   **Manage Agents**: List, create, update, delete, enable/disable, and chat with agents.
-   **Manage Authorizations**: List, create, update, and delete OAuth client authorizations.
-   **Manage Reasoning Engines**: List engines, view agent dependencies, and delete unused engines.
-   **Agent Builder**: A powerful UI to construct and configure ADK-based agents from scratch. It automatically generates the necessary Python code (`main.py`), environment (`.env`), and dependency (`requirements.txt`) files. Features include:
    -   A tool builder for easily adding Vertex AI Search tools.
    -   Options to download the complete agent code as a `.zip` file.
    -   An integrated uploader to stage agent files (`main.py`, `.env`, `requirements.txt`, and a user-provided `agent.pkl`) directly to a GCS bucket.
    -   A deployment wizard to deploy the staged agent to a new or existing Reasoning Engine.
-   **Explore Data Stores**: List data stores within a collection, view their details, and inspect individual documents and their content.
-   **Explore MCP Servers**: Scan for Cloud Run services in a specified region. Identifies potential MCP servers if a service's labels contain "MCP". Provides a detailed view of each service's configuration, including container images and environment variables.
-   **Model Armor Log Viewer**: Fetch and inspect safety policy violation logs from Cloud Logging, showing the verdict, reason, triggered filter, and source assistant for each event.
-   **Comprehensive Backup & Restore**: Backup and restore agents, assistants, data stores, authorizations, and entire Discovery Engine configurations.
-   **Dynamic Configuration**: Automatically resolves Project IDs to Project Numbers and populates dropdowns for collections, apps, and assistants.

## Prerequisites

Before using this application, ensure you have the following:

1.  **A Google Cloud Project**: Your resources will be managed within a specific GCP project.
2.  **Enabled APIs**: Make sure the following APIs are enabled for your project:
    -   Discovery Engine API
    -   AI Platform (Vertex AI) API
    -   Cloud Resource Manager API
    -   Cloud Logging API
    -   Cloud Storage API
3.  **`gcloud` CLI**: You need the Google Cloud CLI installed and authenticated to obtain an access token.
4.  **Access Token**: Generate a temporary access token by running the following command in your terminal:
    ```sh
    gcloud auth print-access-token
    ```

## How to Run

This method is recommended for development and uses the standard Node.js ecosystem.

1.  **Install Dependencies**: Open your terminal in the project's root directory and run:
    ```sh
    npm install
    ```
2.  **Start the Development Server**: Once installation is complete, start the server:
    ```sh
    npm run dev
    ```
    This command will launch a development server and should automatically open the application in your default browser (usually at `http://localhost:3000` or a similar address).
3.  **Configure the App**:
    -   Paste the access token generated from the `gcloud` command into the **"Paste GCP Access Token"** field.
    -   Enter your GCP Project ID or Project Number into the configuration section on the **"Agents"** page and click **"Set"**.
4.  **Ready to Use**: You can now use the application to manage your Agentspace resources.

## API Documentation & Examples

This UI is a wrapper around several Google Cloud REST APIs. Below are references to the official documentation and `curl` examples for common operations.

### 1. Gemini Enterprise API (formerly Agentspace / Discovery Engine)

This is the primary API for managing agents, assistants, collections, and authorizations.

-   **Official Documentation**: [cloud.google.com/gemini/enterprise/docs/reference/rest](https://cloud.google.com/gemini/enterprise/docs/reference/rest)

#### Example: List Agents

This command retrieves a list of all agents within a specific assistant.

```sh
ACCESS_TOKEN="[YOUR_ACCESS_TOKEN]"
PROJECT_ID="[YOUR_PROJECT_ID]"
LOCATION="global"
COLLECTION_ID="default_collection"
ENGINE_ID="[YOUR_ENGINE_ID]"
ASSISTANT_ID="[YOUR_ASSISTANT_ID]"

curl -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: $PROJECT_ID" \
  "https://discoveryengine.googleapis.com/v1alpha/projects/$PROJECT_ID/locations/$LOCATION/collections/$COLLECTION_ID/engines/$ENGINE_ID/assistants/$ASSISTANT_ID/agents"
```

#### Example: Create an Agent

This command registers a new agent with a provisioned reasoning engine.

```sh
ACCESS_TOKEN="[YOUR_ACCESS_TOKEN]"
PROJECT_ID="[YOUR_PROJECT_ID]"
LOCATION="global"
COLLECTION_ID="default_collection"
ENGINE_ID="[YOUR_ENGINE_ID]"
ASSISTANT_ID="[YOUR_ASSISTANT_ID]"
RE_LOCATION="us-central1"
RE_ID="[YOUR_REASONING_ENGINE_ID]"


curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: $PROJECT_ID" \
  -d '{
        "displayName": "My API Agent",
        "description": "An agent created via curl.",
        "adkAgentDefinition": {
          "tool_settings": {
            "tool_description": "A tool that can call external APIs."
          },
          "provisioned_reasoning_engine": {
            "reasoning_engine": "projects/'"$PROJECT_ID"'/locations/'"$RE_LOCATION"'/reasoningEngines/'"$RE_ID"'"
          }
        }
      }' \
  "https://discoveryengine.googleapis.com/v1alpha/projects/$PROJECT_ID/locations/$LOCATION/collections/$COLLECTION_ID/engines/$ENGINE_ID/assistants/$ASSISTANT_ID/agents"
```

#### Example: List Documents

This command retrieves a list of all documents within a specific data store branch.

```sh
curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: YOUR_PROJECT_ID" \
  "https://discoveryengine.googleapis.com/v1alpha/projects/YOUR_PROJECT_ID/locations/YOUR_LOCATION/collections/YOUR_COLLECTION_ID/dataStores/YOUR_DATASTORE_ID/branches/0/documents"
```

You'll need to replace these placeholders:

-   `YOUR_PROJECT_ID`: Your Google Cloud Project ID.
-   `YOUR_LOCATION`: The location of your datastore (e.g., global, us).
-   `YOUR_COLLECTION_ID`: The collection that contains your datastore.
-   `YOUR_DATASTORE_ID`: The specific ID of the datastore whose documents you want to list.

#### Example: Get Document

This command retrieves the details for a single document.

```sh
ACCESS_TOKEN="[YOUR_ACCESS_TOKEN]"
PROJECT_ID="[YOUR_PROJECT_ID]"
LOCATION="[YOUR_LOCATION]"
COLLECTION_ID="[YOUR_COLLECTION_ID]"
DATASTORE_ID="[YOUR_DATASTORE_ID]"
DOCUMENT_ID="[YOUR_DOCUMENT_ID]"

curl -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: $PROJECT_ID" \
  "https://discoveryengine.googleapis.com/v1alpha/projects/$PROJECT_ID/locations/$LOCATION/collections/$COLLECTION_ID/dataStores/$DATASTORE_ID/branches/0/documents/$DOCUMENT_ID"
```

---

### 2. AI Platform API (Reasoning Engines)

This API is used to manage the Reasoning Engines that power ADK-based agents.

-   **Official Documentation**: [cloud.google.com/vertex-ai/docs/reference/rest/v1beta1/projects.locations.reasoningEngines](https://cloud.google.com/vertex-ai/docs/reference/rest/v1beta1/projects.locations.reasoningEngines)

#### Example: List Reasoning Engines

```sh
ACCESS_TOKEN="[YOUR_ACCESS_TOKEN]"
PROJECT_ID="[YOUR_PROJECT_ID]"
LOCATION="us-central1"

curl -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Goog-User-Project: $PROJECT_ID" \
  "https://"$LOCATION"-aiplatform.googleapis.com/v1beta1/projects/"$PROJECT_ID"/locations/"$LOCATION"/reasoningEngines"
```

---

### 3. Cloud Resource Manager API

This API is used to get project metadata, such as resolving a Project ID to a Project Number.

-   **Official Documentation**: [cloud.google.com/resource-manager/reference/rest/v1/projects/get](https://cloud.google.com/resource-manager/reference/rest/v1/projects/get)

#### Example: Get Project Details

```sh
ACCESS_TOKEN="[YOUR_ACCESS_TOKEN]"
PROJECT_ID="[YOUR_PROJECT_ID]"

curl -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://cloudresourcemanager.googleapis.com/v1/projects/$PROJECT_ID"
```

---

### 4. Cloud Logging API

This API is used by the Model Armor page to fetch safety policy violation logs.

-   **Official Documentation**: [cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list](https://cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list)

#### Example: List Model Armor Violation Logs

```sh
ACCESS_TOKEN="[YOUR_ACCESS_TOKEN]"
PROJECT_ID="[YOUR_PROJECT_ID]"

curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "projectIds": ["'"$PROJECT_ID"'"],
        "filter": "log_id(\"modelarmor.googleapis.com/sanitize_operations\")",
        "orderBy": "timestamp desc",
        "pageSize": 50
      }' \
  "https://logging.googleapis.com/v2/entries:list"
```