# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


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
