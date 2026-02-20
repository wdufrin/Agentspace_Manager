import logging
from typing import Optional
from google.oauth2.credentials import Credentials

logger = logging.getLogger(__name__)

def get_user_credentials(tool_context) -> Optional[Credentials]:
    return None
