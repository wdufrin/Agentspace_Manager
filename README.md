# Agentspace Manager

A web interface to manage Google Cloud Agentspace resources, including agents, authorizations, and reasoning engines. This UI provides a user-friendly way to perform operations similar to the `gcloud` CLI tool for Agentspace.

This application is built using React and communicates with Google Cloud APIs via the **Google API JavaScript Client (`gapi`)**.

## Key Features

-   **Manage Agents**: List, create, update, delete, enable/disable, and chat with agents.
-   **Manage Authorizations**: List, create, update, and delete OAuth client authorizations.
-   **Manage Reasoning Engines**: List engines, view agent dependencies, and delete unused engines.
-   **Agent Builder**: A powerful UI to construct and configure ADK-based agents from scratch. It automatically generates the necessary Python code (`agent.py`), environment (`.env`), and dependency (`requirements.txt`) files. Features include:
    -   A tool builder for easily adding Vertex AI Search tools.
    -   Options to download the complete agent code as a `.zip` file.
    -   An integrated uploader to stage agent files (`agent.pkl` and `requirements.txt`) directly to a GCS bucket.
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
    -   Cloud Run Admin API
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

## Underlying Google Cloud APIs

While the application uses the Google API JavaScript Client (`gapi`) for all interactions, the following `curl` examples illustrate the underlying REST API calls for each major feature. This is useful for reference, testing, and understanding the raw API endpoints.

You will need to replace placeholders like `[YOUR_PROJECT_ID]` and `[YOUR_ACCESS_TOKEN]` with your own values.

### List of APIs Used

The application interacts with the following Google Cloud API endpoints:

-   **Gemini Enterprise API (Discovery Engine)**: `https://discoveryengine.googleapis.com` (and regional variants `us-` and `eu-`)
-   **Vertex AI API (AI Platform)**: `https://[LOCATION]-aiplatform.googleapis.com`
-   **Cloud Resource Manager API**: `https://cloudresourcemanager.googleapis.com`
-   **Cloud Logging API**: `https://logging.googleapis.com`
-   **Cloud Run Admin API**: `https://[LOCATION]-run.googleapis.com`
-   **Cloud Storage API**: `https://storage.googleapis.com`

---

### Examples by Feature

#### **Agents Tab**

**List Agents:** Retrieves all agents within a specific assistant.

```sh
curl -X GET \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"
```

**Create an Agent:** Registers a new ADK agent linked to a Reasoning Engine.

```sh
curl -X POST \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  -d '{
        "displayName": "My API Agent",
        "adkAgentDefinition": {
          "tool_settings": { "tool_description": "A tool that can call APIs." },
          "provisioned_reasoning_engine": {
            "reasoning_engine": "projects/[YOUR_PROJECT_ID]/locations/[RE_LOCATION]/reasoningEngines/[RE_ID]"
          }
        }
      }' \
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"
```

#### **Authorizations Tab**

**List Authorizations:** Retrieves all OAuth authorizations for the project.

```sh
curl -X GET \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations"
```

**Create an Authorization:** Creates a new OAuth authorization resource.

```sh
curl -X POST \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  -d '{
        "serverSideOauth2": {
          "clientId": "[YOUR_OAUTH_CLIENT_ID]",
          "clientSecret": "[YOUR_OAUTH_CLIENT_SECRET]",
          "authorizationUri": "https://accounts.google.com/o/oauth2/auth?...",
          "tokenUri": "https://oauth2.googleapis.com/token"
        }
      }' \
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations?authorizationId=[NEW_AUTH_ID]"
```

#### **Agent Engines Tab**

**List Reasoning Engines:** Retrieves all Reasoning Engines in a specific location.

```sh
curl -X GET \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"
```

#### **Agent Builder Tab**

**Deploy to a New Reasoning Engine:** Creates a new engine with a deployed ADK agent package from GCS.

```sh
curl -X POST \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  -d '{
        "displayName": "My New Deployed Agent",
        "spec": {
          "agentFramework": "google-adk",
          "packageSpec": {
            "pickleObjectGcsUri": "gs://[BUCKET_NAME]/[PATH]/agent.pkl",
            "requirementsGcsUri": "gs://[BUCKET_NAME]/[PATH]/requirements.txt",
            "pythonVersion": "3.10"
          }
        }
      }' \
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"
```

#### **Data Stores Tab**

**List Data Stores:** Retrieves all data stores within a collection.

```sh
curl -X GET \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores"
```

**List Documents:** Retrieves all documents within a data store.

```sh
curl -X GET \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores/[DATASTORE_ID]/branches/0/documents"
```

#### **MCP Servers Tab**

**List Cloud Run Services:** Retrieves all Cloud Run services in a region to scan for MCP servers.

```sh
curl -X GET \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"
```

#### **Model Armor Tab**

**List Violation Logs:** Fetches safety policy violation logs from Cloud Logging.

```sh
curl -X POST \
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{
        "projectIds": ["[YOUR_PROJECT_ID]"],
        "filter": "log_id(\"modelarmor.googleapis.com/sanitize_operations\")",
        "orderBy": "timestamp desc",
        "pageSize": 50
      }' \
  "https://logging.googleapis.com/v2/entries:list"
```

#### **Backup & Recovery Tab**

This feature orchestrates a series of `list` and `get` calls (like the examples above) to build a comprehensive backup of all specified resources. The restore process uses corresponding `create` calls to rebuild the resources from the backup file.
