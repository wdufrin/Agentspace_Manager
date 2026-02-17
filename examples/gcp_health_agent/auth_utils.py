import os
import logging
from typing import Optional
from google.oauth2.credentials import Credentials
from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)

def get_user_credentials(tool_context: ToolContext) -> Optional[Credentials]:
    """
    Extracts user OAuth2 credentials from the ToolContext state using the configured AUTH_ID.
    
    Args:
        tool_context: The context provided by the ADK runtime.
        
    Returns:
        google.oauth2.credentials.Credentials if token is found, else None.
    """
    # Try to find credentials in context first (injected by Agent Engine)
    auth_id = os.getenv("AUTH_ID", "temp_oauth")
    if auth_id and tool_context.state:
        access_token = tool_context.state.get(auth_id)
        if access_token:
            logger.info(f"Successfully retrieved access token for AUTH_ID: {auth_id}")
            return Credentials(token=access_token)
            
    return None
