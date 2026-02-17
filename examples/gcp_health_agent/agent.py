import os
from dotenv import load_dotenv
from google.adk.agents import Agent
from dotenv import load_dotenv
from google.adk.agents import Agent
from vertexai.preview import reasoning_engines
import google.auth
from google.adk.tools import google_search
from tools import read_recent_logs, check_health, get_service_metrics, list_services, list_projects, resolve_project_id, list_active_findings, list_recommendations, list_cost_recommendations, check_service_health, run_connectivity_test

load_dotenv()

# Initialize Tools
# No additional tools defined

# Initialize Plugins
# No plugins defined



# Define the root agent
root_agent = Agent(
    name="GCP_Health_Monitor",
    description="An expert agent for diagnosing performance, health, and security issues across Google Cloud capabilities.",
    model=os.getenv("MODEL", "gemini-2.5-flash"),
    instruction="""You are an expert Google Cloud Site Reliability Engineer and Cloud Architect.
Your role is to diagnose performance, health, and security issues across Google Cloud.

Whenever you are asked to check the health or status of an environment or specific service, perform the following general workflow:
1. Verify the Project ID using resolve_project_id. If a name was provided, ensure it resolves. If no project is provided, ask the user or default to the environment's project if safe.
2. Check Service Health using check_service_health to see if there are any ongoing broader GCP outages affecting the project.
3. List active resources (e.g., using list_services for Cloud Run) to understand what is running.
4. Check health signals/alerts using check_health to see if any configured alert policies are currently firing.
5. If a specific service is mentioned, retrieve its recent metrics using get_service_metrics (CPU, memory, latency, requests) to look for anomalies.
6. Check for active security findings using list_active_findings, as security events can impact health or compliance.
7. Check for recommendations using list_recommendations and list_cost_recommendations to suggest optimizations.

Report formatting guidelines:
* Format your answers cleanly using Markdown.
* For lists of findings or resources, use bullet points.
* Always cite the exact project ID and environment details where you found the information.""",
    tools=[google_search, read_recent_logs, check_health, get_service_metrics, list_services, list_projects, resolve_project_id, list_active_findings, list_recommendations, list_cost_recommendations, check_service_health, run_connectivity_test],
    
)





# Define the App for Vertex AI Agent Engine
# Note: Root agent is wrapped in AdkApp as requested.
# If streaming is enabled, wrap the agent.
# Note: AdkApp expects 'agent' to have a 'query' method.
final_agent = root_agent
 # Plugins take precedence if wrapping agent, but typically plug-ins wrap root_agent inside AdkApp logic.
# Actually AdkApp takes 'agent'. If we use plugins, 'adk_app' IS the app. 
# But 'reasoning_engines.AdkApp' wraps an agent. 
# If we have plugins, 'adk_app' is an instance of 'google.adk.apps.App'.
# Reasoning Engine's AdkApp expects a 'google.adk.agents.Agent' or compatible.

app = reasoning_engines.AdkApp(
    agent=final_agent,
    enable_tracing=False
)