import os
import logging
import vertexai
from vertexai.preview import reasoning_engines

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION")
staging_bucket = os.getenv("STAGING_BUCKET")

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)

try:
    import agent
    if hasattr(agent, 'app'):
        # If the user defined an App, use it.
        app_obj = agent.app
        logger.info("Imported 'app' from agent.py")
    else:
        # Fallback to root_agent
        logger.info("Imported 'root_agent' from agent.py")
        app_obj = agent.root_agent
        
    logger.info("Agent imported successfully.")
except ImportError as e:
    logger.error(f"Failed to import agent: {e}")
    raise

# Read requirements
reqs = ["google-cloud-aiplatform[adk,agent_engines]>=1.75.0", "google-adk>=0.1.0", "python-dotenv"]
if os.path.exists("requirements.txt"):
    with open("requirements.txt", "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                reqs.append(line)
reqs = list(set(reqs))

# Parse .env for deploymentSpec
env_vars = []
if os.path.exists(".env"):
    try:
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip()
                    if not key:
                        continue

                    # Handle quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]

                    # Update os.environ so the SDK can pick it up
                    os.environ[key] = value

                    # Append strictly non-reserved keys to env_vars list for deployment
                    if (key not in ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "STAGING_BUCKET", "PROJECT_ID"]
                        and not key.startswith("OTEL_")
                        and not key.startswith("GOOGLE_CLOUD_AGENT_ENGINE_")):
                        env_vars.append(key)

        # Deduplicate env_vars to prevent "EnvVar names must be unique" error
        env_vars = list(set(env_vars))
        logger.info(f"Final deployment env_vars: {env_vars}")
        logger.info(f"Parsed {len(env_vars)} environment variables for deploymentSpec.")
    except Exception as e:
        logger.warning(f"Failed to parse .env file: {e}")

# --- CRITICAL FIX FOR Pydantic ValidationError ---
# We check if the app_obj is already an AdkApp instance by checking key attributes or class name.
# This prevents 'double-wrapping' which causes the 'Input should be a valid dictionary or instance of BaseAgent' error.
is_already_adk_app = (
    hasattr(app_obj, 'agent') or
    hasattr(app_obj, '_agent') or
    app_obj.__class__.__name__ == 'AdkApp'
)

if is_already_adk_app:
     app_to_deploy = app_obj
     logger.info(f"App is already an AdkApp instance ({type(app_obj).__name__}). Proceeding to deploy...")
else:
     logger.info("Wrapping agent in AdkApp for deployment...")
     app_to_deploy = reasoning_engines.AdkApp(agent=app_obj, enable_tracing=False)

logger.info("Creating Agent Engine...")

# Detect extra packages (like auth_utils.py)
extra_packages = []
for f in os.listdir("."):
    if f in ["deploy_re.py", ".env", "requirements.txt", ".git", ".adk", "venv", ".venv", "__pycache__", "node_modules"]:
        continue

    if os.path.isfile(f) and f.endswith(".py"):
            extra_packages.append(f)
    elif os.path.isdir(f) and not f.startswith("."):
            extra_packages.append(f)

logger.info(f"Extra packages detected: {extra_packages}")

remote_app = reasoning_engines.ReasoningEngine.create(
    app_to_deploy,
    requirements=reqs,
    env_vars=env_vars,
    extra_packages=extra_packages,
    display_name=os.getenv("AGENT_DISPLAY_NAME", "GCP_Health_Monitor"),
)

print(f"Deployment finished!")
print(f"Resource Name: {remote_app.resource_name}")