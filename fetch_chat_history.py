import vertexai
from vertexai.preview import reasoning_engines
from google.cloud import discoveryengine_v1
from google.api_core.client_options import ClientOptions
import json
import datetime
import os

# Project Configuration
PROJECT_ID = "ancient-sandbox-322523" # User's project ID
PROJECT_NUMBER = "180054373655" # User's project Number from the example
LOCATION = "us-central1"
GLOBAL_LOCATION = "global"

def serializer(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    return str(obj)

def fetch_reasoning_engine_history():
    print(f"\n--- Fetching Vertex AI Agent Engine History ({LOCATION}) ---")
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    
    history_data = []
    try:
        engines = reasoning_engines.ReasoningEngine.list()
        for engine in engines:
            print(f"Found Engine: {engine.resource_name} ({engine.display_name})")
            try:
                # Listing sessions for Reasoning Engine
                # Note: 'list_sessions' might be available on the engine object or via separate client
                # We use the method if available, or try to iterate
                # In current preview, we might need to rely on the fact that we can list sessions given an engine
                
                # Try listing sessions using the class method if instance method fails or doesn't exist
                sessions = reasoning_engines.ReasoningEngineSession.list(reasoning_engine=engine)
                
                for session in sessions:
                    print(f"  Session: {session.resource_name}")
                    session_info = {
                        "type": "ReasoningEngine",
                        "engine_id": engine.resource_name,
                        "session_id": session.resource_name,
                        "user_id": getattr(session, "user_id", "unknown"),
                        "create_time": getattr(session, "create_time", None),
                        "history": []
                    }
                    
                    try:
                        # Fetch events/history
                        events = session.list_events() 
                        # Or session.history depending on SDK version
                        # We'll try to serialize whatever we get
                        session_info["history"] = [
                            {"role": e.role, "parts": [p.text for p in e.parts]} 
                            for e in events
                        ] if events else []
                    except Exception as e:
                        print(f"    Error fetching events: {e}")
                    
                    history_data.append(session_info)
            except Exception as e:
                print(f"  Error processing engine sessions: {e}")
                
    except Exception as e:
        print(f"Error fetching Reasoning Engine history: {e}")

    return history_data

def fetch_discovery_engine_history():
    print(f"\n--- Fetching Discovery Engine History (Global) ---")
    
    # Discovery Engine often uses 'global' location for collections
    client_options = ClientOptions(api_endpoint=f"global-discoveryengine.googleapis.com")
    client = discoveryengine_v1.ConversationalSearchServiceClient(client_options=client_options)
    
    history_data = []
    
    # We need to list engines/apps first. 
    # Resource name: projects/{project}/locations/{location}/collections/{collection}/engines/{engine}
    # But often we just want to list all engines in the project/location.
    
    engine_client = discoveryengine_v1.EngineServiceClient(client_options=client_options)
    parent = f"projects/{PROJECT_NUMBER}/locations/{GLOBAL_LOCATION}/collections/default_collection"
    
    try:
        print(f"Listing engines in: {parent}")
        # Note: ListEnginesRequest requires a collection
        request = discoveryengine_v1.ListEnginesRequest(parent=parent)
        page_result = engine_client.list_engines(request=request)
        
        for engine in page_result:
            print(f"Found Engine: {engine.name} ({engine.display_name})")
            
            # Now list sessions for this engine
            # Session parent: projects/{project}/locations/{location}/collections/{collection}/engines/{engine}
            session_parent = engine.name
            
            try:
                list_sessions_request = discoveryengine_v1.ListSessionsRequest(parent=session_parent)
                sessions = client.list_sessions(request=list_sessions_request)
                
                for session in sessions:
                    print(f"  Session: {session.name}")
                    session_info = {
                        "type": "DiscoveryEngine",
                        "engine_id": engine.name,
                        "session_id": session.name,
                        "user_id": session.user_pseudo_id,
                        "state": str(session.state),
                        "history": []
                    }
                    
                    # Fetch turns/messages
                    # Discovery Engine sessions have 'turns'
                    try:
                        # We might need to separate call for details if list doesn't include full history
                        # Usually ListSessions returns Session objects which might have 'turns' populated or not.
                        # If not, we use GetSession.
                        
                        # Let's try GetSession to be sure we get turns
                        get_session_request = discoveryengine_v1.GetSessionRequest(name=session.name)
                        full_session = client.get_session(request=get_session_request)
                        
                        for turn in full_session.turns:
                            # User query
                            if turn.query:
                                session_info["history"].append({
                                    "role": "user",
                                    "text": turn.query.text
                                })
                            # Agent answer
                            if turn.answer:
                                session_info["history"].append({
                                    "role": "model",
                                    "text": turn.answer.reply_text
                                })
                                
                    except Exception as e:
                        print(f"    Error fetching session details: {e}")
                        
                    history_data.append(session_info)

            except Exception as e:
                print(f"  Error listing sessions for engine {engine.display_name}: {e}")

    except Exception as e:
        print(f"Error fetching Discovery Engine history: {e}")
        
    return history_data

def main():
    all_history = []
    
    # 1. Fetch ADK/Agent Engine History
    all_history.extend(fetch_reasoning_engine_history())
    
    # 2. Fetch Discovery Engine (No Code/Search) History
    all_history.extend(fetch_discovery_engine_history())
    
    # 3. Save
    output_file = "chat_history.json"
    with open(output_file, "w") as f:
        json.dump(all_history, f, indent=2, default=serializer)
    
    print(f"\nTotal sessions exported: {len(all_history)}")
    print(f"Saved to {output_file}")

if __name__ == "__main__":
    main()
