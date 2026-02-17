import os
import logging
import json
import requests
import google.auth
import google.auth.transport.requests
from typing import Optional, Dict, Any, List
from google.adk.tools import ToolContext
from auth_utils import get_user_credentials

logger = logging.getLogger(__name__)

from google.cloud import logging as cloud_logging

def read_recent_logs(tool_context: ToolContext, filter_str: str = "") -> str:
    """
    Reads the last 20 log entries from Cloud Logging.
    
    Args:
        tool_context: The context provided by the ADK runtime.
        filter_str: Optional filter string for the logs.
    """
    try:
        creds = get_user_credentials(tool_context)
        # fallback to default creds if not found (or let library handle it if None)
        client = cloud_logging.Client(credentials=creds, project=os.environ["GOOGLE_CLOUD_PROJECT"])
        
        # Default simple filter if empty
        if not filter_str:
            filter_str = "severity>=WARNING"
            
        entries = client.list_entries(filter_=filter_str, page_size=20, max_results=20, order_by=cloud_logging.DESCENDING)
        
        logs = []
        for entry in entries:
            timestamp = entry.timestamp.isoformat() if entry.timestamp else "N/A"
            payload = str(entry.payload) if entry.payload else "No Payload"
            logs.append(f"[{timestamp}] {entry.severity}: {payload}")
            
        if not logs:
            return "No logs found matching the filter."
            
        return "\n".join(logs)
    except Exception as e:
        return f"Error reading logs: {e}"

from google.cloud import monitoring_v3
import time

def check_health(tool_context: ToolContext, project_id: str = None) -> str:
    """Checks the health of applications in the GCP project by listing alert policies."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = monitoring_v3.AlertPolicyServiceClient(credentials=credential)
        policies = client.list_alert_policies(request={"name": f"projects/{project_id}"})
        active_policies = [f"- {p.display_name} (Enabled)" for p in policies if p.enabled]
        return f"Alert Policies:\n" + "\n".join(active_policies) if active_policies else "No enabled alert policies."
    except Exception as e:
        return f"Error checking health: {str(e)}"

def get_service_metrics(tool_context: ToolContext, service_name: str, metric_type: str = "cpu", duration_minutes: int = 60, project_id: str = None) -> str:
    """Retrieves metrics for a specific Cloud Run service. metric_type can be cpu, memory, latency, requests."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = monitoring_v3.MetricServiceClient(credentials=credential)
        metrics_map = {
            "cpu": "run.googleapis.com/container/cpu/utilizations",
            "memory": "run.googleapis.com/container/memory/utilizations",
            "latency": "run.googleapis.com/request_latencies",
            "requests": "run.googleapis.com/request_count"
        }
        if metric_type not in metrics_map: return f"Error: Unknown metric {metric_type}"
        now = time.time()
        interval = monitoring_v3.TimeInterval({"end_time": {"seconds": int(now)}, "start_time": {"seconds": int(now) - (duration_minutes * 60)}})
        filter_str = f'metric.type = "{metrics_map[metric_type]}" AND resource.labels.service_name = "{service_name}"'
        aggregation = monitoring_v3.Aggregation({
            "alignment_period": {"seconds": duration_minutes * 60},
            "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_PERCENTILE_99 if metric_type != "requests" else monitoring_v3.Aggregation.Aligner.ALIGN_SUM,
            "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_MEAN if metric_type != "requests" else monitoring_v3.Aggregation.Reducer.REDUCE_SUM
        })
        results = []
        page_result = client.list_time_series(request={"name": f"projects/{project_id}", "filter": filter_str, "interval": interval, "aggregation": aggregation})
        for ts in page_result:
            for point in ts.points:
                val = point.value
                val_str = f"{val.double_value:.4f}" if val.double_value else f"{val.int64_value}"
                results.append(f"Metric: {metric_type.upper()}, Value: {val_str}")
                break
        return f"Metrics for {service_name}:\n" + "\n".join(results) if results else "No data found."
    except Exception as e:
        return f"Error getting service metrics: {e}"

import google.cloud.run_v2 as run_v2
import google.cloud.resourcemanager_v3 as resourcemanager_v3

def resolve_project_id(tool_context: ToolContext, name_or_id: str) -> str:
    """Resolves a Project Name or ID to a Project ID."""
    if " " in name_or_id or any(c.isupper() for c in name_or_id):
        try:
            credential = get_user_credentials(tool_context)
            if not credential: return "Error: Authentication required."
            client = resourcemanager_v3.ProjectsClient(credentials=credential)
            request = resourcemanager_v3.SearchProjectsRequest(query=f"lifecycleState:ACTIVE AND displayName='{name_or_id}'")
            page_result = client.search_projects(request=request)
            for project in page_result: return project.project_id
            return f"Error: No project found with display name '{name_or_id}'"
        except Exception as e: return f"Error resolving project: {str(e)}"
    return name_or_id

def list_services(tool_context: ToolContext, project_id: str = None) -> str:
    """List Cloud Run services in the configured project across ALL regions."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = run_v2.ServicesClient(credentials=credential)
        parent = f"projects/{project_id}/locations/-"
        request = run_v2.ListServicesRequest(parent=parent)
        page_result = client.list_services(request=request)
        services = []
        for service in page_result:
            conditions = {c.type_: c.state for c in service.conditions}
            succeeded = run_v2.Condition.State.CONDITION_SUCCEEDED
            is_ready = False
            if "Ready" in conditions: is_ready = (conditions["Ready"] == succeeded)
            elif "RoutesReady" in conditions and "ConfigurationsReady" in conditions: is_ready = (conditions["RoutesReady"] == succeeded and conditions["ConfigurationsReady"] == succeeded)
            status = "Ready" if is_ready else "Not Ready"
            region = service.name.split('/')[3]
            service_name = service.name.split('/')[-1]
            services.append(f"- {service_name} ({region}): {status} ({service.uri})")
        return "Cloud Run Services:\n" + "\n".join(services) if services else "No Cloud Run services found."
    except Exception as e:
        return f"Error listing Cloud Run services: {str(e)}"

def list_projects(tool_context: ToolContext, filter_str: str = "lifecycleState:ACTIVE") -> str:
    """List accessible Google Cloud projects."""
    try:
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = resourcemanager_v3.ProjectsClient(credentials=credential)
        request = resourcemanager_v3.SearchProjectsRequest(query=filter_str)
        page_result = client.search_projects(request=request)
        projects = [f"- {p.display_name} ({p.project_id})" for p in page_result]
        return "Projects:\n" + "\n".join(projects) if projects else "No projects found."
    except Exception as e:
        return f"Error listing projects: {str(e)}"

import google.cloud.securitycenter as securitycenter

def list_active_findings(tool_context: ToolContext, category: str = None, project_id: str = None) -> str:
    """Lists active, unmuted security findings for the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = securitycenter.SecurityCenterClient(credentials=credential)
        source_name = f"projects/{project_id}/sources/-"
        filter_str = 'state="ACTIVE" AND mute="UNMUTED"'
        if category: filter_str += f' AND category="{category}"'
        req = securitycenter.ListFindingsRequest(parent=source_name, filter=filter_str, page_size=100)
        findings_by_category = {}
        count = 0
        for result in client.list_findings(request=req):
            finding = result.finding
            cat = finding.category
            resource = finding.resource_name
            severity = finding.severity.name if hasattr(finding.severity, 'name') else str(finding.severity)
            if cat not in findings_by_category: findings_by_category[cat] = []
            findings_by_category[cat].append(f"[{severity}] {resource}")
            count += 1
            if count >= 20: break
        if count == 0: return f"No active, unmuted security findings found for project {project_id}."
        output_lines = [f"Active Security Findings for {project_id}:"]
        for cat, items in findings_by_category.items():
            output_lines.append(f"\nCategory: {cat}")
            for item in items: output_lines.append(f"  - {item}")
        if count >= 20: output_lines.append("\n(Output truncated)")
        return "\n".join(output_lines)
    except Exception as e:
        if "PermissionDenied" in str(e) or "disabled" in str(e).lower():
            return f"Unable to list findings. Security Command Center might not be active or you lack permissions for project {project_id}."
        return f"Error fetching security findings: {str(e)}"

import google.cloud.recommender_v1 as recommender_v1
import google.cloud.run_v2 as run_v2

def list_recommendations(tool_context: ToolContext, project_id: str = None) -> str:
    """List active recommendations for Cloud Run services, focusing on security and identity."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        regions = set()
        try:
            run_client = run_v2.ServicesClient(credentials=credential)
            page_result = run_client.list_services(request=run_v2.ListServicesRequest(parent=f"projects/{project_id}/locations/-"))
            for service in page_result:
                parts = service.name.split("/")
                if len(parts) > 3: regions.add(parts[3])
        except Exception: pass
        if not regions: regions.add(os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
        recommender_client = recommender_v1.RecommenderClient(credentials=credential)
        recommenders = ["google.run.service.IdentityRecommender", "google.run.service.SecurityRecommender"]
        results = []
        for location in regions:
            for r_id in recommenders:
                try:
                    request = recommender_v1.ListRecommendationsRequest(parent=f"projects/{project_id}/locations/{location}/recommenders/{r_id}")
                    for rec in recommender_client.list_recommendations(request=request):
                        target_resource = "Unknown Resource"
                        if rec.content and rec.content.overview:
                            target_resource = rec.content.overview.get("serviceName") or rec.content.overview.get("service") or rec.content.overview.get("resourceName") or "Unknown Resource"
                        if "/" in target_resource: target_resource = target_resource.split("/")[-1]
                        results.append(f"- [{location}] {target_resource}: {rec.description} (Priority: {rec.priority.name})")
                except Exception: pass
        return "Active Cloud Run Recommendations:\n" + "\n".join(results) if results else "No active security or identity recommendations found for Cloud Run."
    except Exception as e:
        return f"Error listing recommendations: {str(e)}"

def list_cost_recommendations(tool_context: ToolContext, project_id: str = None) -> str:
    """List active cost recommendations for the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        zones = [f"{location}-{suffix}" for suffix in ["a", "b", "c", "f"]]
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        recommender_client = recommender_v1.RecommenderClient(credentials=credential)
        recommenders = [
            "google.compute.instance.IdleResourceRecommender", 
            "google.compute.instance.MachineTypeRecommender",
            "google.compute.address.IdleResourceRecommender",
            "google.compute.disk.IdleResourceRecommender"
        ]
        results = []
        total_savings = 0.0
        currency = "USD"
        for zone in zones:
            for r_id in recommenders:
                try:
                    request = recommender_v1.ListRecommendationsRequest(parent=f"projects/{project_id}/locations/{zone}/recommenders/{r_id}")
                    for rec in recommender_client.list_recommendations(request=request):
                        impact = 0.0
                        if rec.primary_impact.cost_projection.cost.units: impact += float(rec.primary_impact.cost_projection.cost.units)
                        if rec.primary_impact.cost_projection.cost.nanos: impact += float(rec.primary_impact.cost_projection.cost.nanos) / 1e9
                        savings = -impact if impact < 0 else 0
                        if savings > 0:
                            total_savings += savings
                            if rec.primary_impact.cost_projection.cost.currency_code: currency = rec.primary_impact.cost_projection.cost.currency_code
                        target = "Unknown"
                        if rec.content.overview:
                             target = rec.content.overview.get("resourceName") or rec.content.overview.get("resource") or "Unknown"
                        if "/" in target: target = target.split("/")[-1]
                        results.append(f"- [{zone}] {target}: {rec.description} (Est. Savings: {savings:.2f} {currency}/mo)")
                except Exception: pass
        if not results: return f"No active cost recommendations found in {location} zones."
        return f"Active Cost Recommendations (Total Est. Savings: {total_savings:.2f} {currency}/mo):\n" + "\n".join(results)
    except Exception as e:
        return f"Error listing cost recommendations: {str(e)}"

from google.cloud import servicehealth_v1

def check_service_health(tool_context: ToolContext, project_id: str = None) -> str:
    """Checks for active Google Cloud Service Health events affecting the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = servicehealth_v1.ServiceHealthClient(credentials=credential)
        parent = f"projects/{project_id}/locations/global"
        request = servicehealth_v1.ListEventsRequest(parent=parent, filter='state="ACTIVE"')
        results = [f"- [{e.category.name}][{e.state.name}] {e.title}: {e.description} (Updated: {e.update_time})" for e in client.list_events(request=request)]
        return f"Active Service Health Events for {project_id}:\n" + "\n".join(results) if results else f"No active service health events found for project {project_id}."
    except Exception as e:
        return f"Error checking service health: {str(e)}"

from google.cloud import network_management_v1

def run_connectivity_test(tool_context: ToolContext, source_ip: str = None, source_network: str = None, destination_ip: str = None, destination_port: int = None, protocol: str = "TCP", project_id: str = None) -> str:
    """Runs a network connectivity test."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = network_management_v1.ReachabilityServiceClient(credentials=credential)
        parent = f"projects/{project_id}/locations/global"
        
        endpoint_source = network_management_v1.Endpoint()
        if source_ip: endpoint_source.ip_address = source_ip
        if source_network: endpoint_source.network = source_network
        
        endpoint_destination = network_management_v1.Endpoint()
        if destination_ip: endpoint_destination.ip_address = destination_ip
        if destination_port: endpoint_destination.port = destination_port
        
        connectivity_test = network_management_v1.ConnectivityTest(
            source=endpoint_source,
            destination=endpoint_destination,
            protocol=protocol
        )
        
        request = network_management_v1.CreateConnectivityTestRequest(
            parent=parent,
            test_id="adk-temp-test",
            connectivity_test=connectivity_test
        )
        # Note: Proper implementation requires polling the LRO, skipping full implementation for brevity.
        return "Not fully implemented in template."
    except Exception as e:
        return f"Error running connectivity test: {str(e)}"
