# Agentspace Manager

A web interface to manage Google Cloud Agentspace resources, including agents, authorizations, and reasoning engines. This UI provides a user-friendly way to perform operations similar to the `gcloud` CLI tool for Agentspace.

## Key Features

-   **Manage Agents**: List, create, update, delete, enable/disable, and chat with agents.
-   **Manage Authorizations**: List, create, update, and delete OAuth client authorizations.
-   **Manage Reasoning Engines**: List engines, view agent dependencies, and delete unused engines.
-   **Comprehensive Backup & Restore**: Backup and restore agents, assistants, data stores, authorizations, and entire Discovery Engine configurations.
-   **Dynamic Configuration**: Automatically resolves Project IDs to Project Numbers and populates dropdowns for collections, apps, and assistants.

## Prerequisites

Before using this application, ensure you have the following:

1.  **A Google Cloud Project**: Your resources will be managed within a specific GCP project.
2.  **Enabled APIs**: Make sure the following APIs are enabled for your project:
    -   Discovery Engine API
    -   AI Platform (Vertex AI) API
    -   Cloud Resource Manager API
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
    npm start
    ```
    This command will launch a development server and should automatically open the application in your default browser (usually at `http://localhost:3000` or a similar address).
3.  **Configure the App**:
    -   Paste the access token generated from the `gcloud` command into the **"Paste GCP Access Token"** field.
    -   Enter your GCP Project ID or Project Number into the configuration section on the **"Agents"** page and click **"Set"**.
4.  **Ready to Use**: You can now use the application to manage your Agentspace resources.

## API Documentation & Examples

This UI is a wrapper around several Google Cloud REST APIs. Below are references to the official documentation and `curl` examples for common operations.

### 1. Discovery Engine API (Agentspace)

This is the primary API for managing agents, assistants, collections, and authorizations.

-   **Official Documentation**: [cloud.google.com/agentspace/docs/reference/rest](https://cloud.google.com/agentspace/docs/reference/rest)

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