
import os
import logging
import vertexai
from vertexai.preview import reasoning_engines

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mock env vars for local analysis
project_id = "mock-project"
location = "mock-location"
staging_bucket = "gs://mock-bucket"

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
# vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)

try:
    import app
    if hasattr(app, 'app'):
        # If the user defined an App, use it.
        app_obj = app.app
        logger.info(f"Imported 'app' from app.py. Attributes: {dir(app_obj)}")
        if hasattr(app_obj, '_lazy_agent'):
             logger.info(f"App has _lazy_agent. Initial state: {app_obj._lazy_agent}")
        if hasattr(app_obj, 'agent'):
             logger.info("WARNING: App still has 'agent' attribute!")
    else:
        logger.error("No 'app' variable found in app.py")
        raise AttributeError("No 'app' variable")
except ImportError as e:
    logger.error(f"Failed to import app: {e}")
    raise
