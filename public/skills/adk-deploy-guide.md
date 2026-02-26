---
name: adk-deploy-guide
description: >
  MUST READ before deploying any ADK agent.
  Deployment guide — Agent Engine, Cloud Run, CI/CD pipelines, secrets,
  and testing deployed agents. Covers deployment targets, infrastructure
  setup, and production deployment workflows.
  Use when user says "deploy my agent", "set up CI/CD", "configure secrets",
  "test my deployed agent", "make deploy", "set up staging and production",
  or when running make deploy or troubleshooting deployment issues.
  Do NOT use for API code patterns (use adk-cheatsheet), evaluation
  (use adk-eval-guide), or project scaffolding (use adk-scaffold).
metadata:
  author: Google
  version: 0.1.0
  mcp-server: adk-mcp
---

# ADK Deployment Guide

> **Note:** This guide assumes a scaffolded project (created via the `/adk-scaffold` skill or Agent Starter Pack CLI).
> It references scaffolded project conventions like `make deploy`, `deployment/terraform/`, and `deployment_metadata.json`.
> For non-scaffolded projects, the general concepts still apply — and you can use the **scaffold as reference** pattern
> (see `/adk-scaffold`) to generate a temporary project and copy over Terraform, CI/CD, or Dockerfile configs.

## Pre-Deployment Tests

Once evaluation thresholds are met, run tests before deployment:

```bash
make test
```

If tests fail, fix issues and run again until all tests pass.

---

## Deploy to Dev Environment

1. **Notify the human**: "Eval scores meet thresholds and tests pass. Ready to deploy to dev?"
2. **Wait for explicit approval**
3. Once approved: `make deploy`

**IMPORTANT**: Never run `make deploy` without explicit human approval.

### Deployment Timeouts

Agent Engine deployments can take 5-10 minutes. If `make deploy` times out:

1. Check if deployment succeeded:
```python
import vertexai
client = vertexai.Client(location="us-central1")
for engine in client.agent_engines.list():
    print(engine.name, engine.display_name)
```

2. If the engine exists, update `deployment_metadata.json` with the engine ID.

---

## Production Deployment — Choose Your Path

After validating in dev, **ask the user** which deployment approach they prefer:

### Option A: Simple Single-Project Deployment

**Best for:** Personal projects, prototypes, teams without complex CI/CD requirements.

**Steps:**
1. Set up infrastructure: `make setup-dev-env`
2. Deploy: `make deploy`

**Pros:** Simpler setup, faster to get running, single GCP project.
**Cons:** No automated staging/prod pipeline, manual deployments.

### Option B: Full CI/CD Pipeline

**Best for:** Production applications, teams requiring staging → production promotion.

**Prerequisites:**
1. Project must NOT be in a gitignored folder
2. User must provide staging and production GCP project IDs
3. GitHub repository name and owner

**Steps:**
1. If prototype, first add Terraform/CI-CD files using the Agent Starter Pack CLI (see `/adk-scaffold` for full options):
   ```bash
   uvx agent-starter-pack enhance . --cicd-runner github_actions -y -s
   ```

2. Ensure you're logged in to GitHub CLI:
   ```bash
   gh auth login  # (skip if already authenticated)
   ```

3. Run setup-cicd:
   ```bash
   uvx agent-starter-pack setup-cicd \
     --staging-project YOUR_STAGING_PROJECT \
     --prod-project YOUR_PROD_PROJECT \
     --repository-name YOUR_REPO_NAME \
     --repository-owner YOUR_GITHUB_USERNAME \
     --auto-approve \
     --create-repository
   ```

4. Push code to trigger deployments

### Choosing a CI/CD Runner

| Runner | Pros | Cons |
|--------|------|------|
| **github_actions** (Default) | No PAT needed, uses `gh auth`, WIF-based, fully automated | Requires GitHub CLI authentication |
| **google_cloud_build** | Native GCP integration | Requires interactive browser authorization (or PAT + app installation ID for programmatic mode) |

**How authentication works:**
- **github_actions**: The Terraform GitHub provider automatically uses your `gh auth` credentials. No separate PAT export needed.
- **google_cloud_build**: Interactive mode uses browser auth. Programmatic mode requires `--github-pat` and `--github-app-installation-id`.

### After CI/CD Setup: Activating the Pipeline

**IMPORTANT**: `setup-cicd` creates infrastructure but doesn't deploy automatically.

Terraform automatically configures all required GitHub secrets and variables (WIF credentials, project IDs, service accounts, etc.). No manual configuration needed.

```bash
git add . && git commit -m "Initial agent implementation"
git push origin main
```

**Staging deployment** happens automatically on push to main.
**Production deployment** requires manual approval:

```bash
# GitHub Actions (recommended): Approve via repository Actions tab
# Production deploys are gated by environment protection rules

# Cloud Build: Find pending build and approve
gcloud builds list --project=PROD_PROJECT --region=REGION --filter="status=PENDING"
gcloud builds approve BUILD_ID --project=PROD_PROJECT
```

---

## Custom Infrastructure (Terraform)

For custom infrastructure patterns (Pub/Sub, BigQuery, Eventarc, Cloud SQL, IAM), consult `references/terraform-patterns.md` for:
- Where to put custom Terraform files (dev vs CI/CD)
- Resource examples (Pub/Sub, BigQuery, Eventarc triggers)
- IAM bindings for custom resources
- Common infrastructure patterns

---

## Secret Manager (for API Credentials)

Instead of passing sensitive keys as environment variables, use GCP Secret Manager.

**1. Store secrets:**
```bash
# Create the secret
echo -n "YOUR_API_KEY" | gcloud secrets create MY_SECRET_NAME --data-file=-

# Update an existing secret
echo -n "NEW_API_KEY" | gcloud secrets versions add MY_SECRET_NAME --data-file=-
```

**2. Grant access:**
```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects list --filter="project_id:$PROJECT_ID" --format="value(project_number)")
SA_EMAIL="service-$PROJECT_NUMBER@gcp-sa-aiplatform-re.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor"
```

**3. Use secrets in deployment (Agent Engine):**

Pass secrets during deployment with `--set-secrets`. Note: `make deploy` doesn't support secrets, so run deploy.py directly:
```bash
uv run python -m app.app_utils.deploy --set-secrets "API_KEY=my-api-key,DB_PASS=db-password:2"
```

Format: `ENV_VAR=SECRET_ID` or `ENV_VAR=SECRET_ID:VERSION` (defaults to latest).

In your agent code, access via `os.environ`:
```python
import os
import json

api_key = os.environ.get("API_KEY")
# For JSON secrets:
db_creds = json.loads(os.environ.get("DB_PASS", "{}"))
```

---

## Testing Your Deployed Agent

### Agent Engine Deployment

**Option 1: Testing Notebook**
```bash
jupyter notebook notebooks/adk_app_testing.ipynb
```

**Option 2: Python Script**
```python
import json
import vertexai

with open("deployment_metadata.json") as f:
    engine_id = json.load(f)["remote_agent_engine_id"]

client = vertexai.Client(location="us-central1")
agent = client.agent_engines.get(name=engine_id)

async for event in agent.async_stream_query(message="Hello!", user_id="test"):
    print(event)
```

**Option 3: Playground**
```bash
make playground
```

### Load Tests
```bash
make load-test
```

---

## Batch & Event Processing

For batch processing patterns (BigQuery remote functions, Pub/Sub, Eventarc, `/invoke` endpoint), consult `references/batch-processing.md` for:
- The `run_agent()` helper with concurrency control
- Universal `/invoke` endpoint that auto-detects input format
- Local testing examples
- Integration examples (BigQuery, Pub/Sub, Eventarc)
- Production considerations (rate limiting, error handling, cost control)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Terraform state locked | `terraform force-unlock -force LOCK_ID` in deployment/terraform/ (the `-force` flag is required to skip the interactive confirmation prompt) |
| Cloud Build authorization pending | Use `github_actions` runner instead |
| GitHub Actions auth failed | Check Terraform completed successfully; re-run `terraform apply` |
| Terraform apply failed | Check GCP permissions and API enablement |
| Resource already exists | Use `terraform import` to import existing resources into state |
| Agent Engine deploy timeout | Deployments take 5-10 min; check status via `gh run view RUN_ID` |
| `make deploy` hangs | Agent Engine deployments are slow; check if engine was created (see Deployment Timeouts above) |
| Secret not available in deployed agent | Verify IAM binding grants `secretAccessor` to the correct service account |
| 403 Permission Denied on deploy | Check that required GCP APIs are enabled and service account has correct roles |

### Monitoring Deployments

```bash
# List recent workflow runs
gh run list --repo OWNER/REPO --limit 5

# View run details and job status
gh run view RUN_ID --repo OWNER/REPO

# View specific job logs (when complete)
gh run view --job=JOB_ID --repo OWNER/REPO --log

# Watch deployment in real-time
gh run watch RUN_ID --repo OWNER/REPO
```

