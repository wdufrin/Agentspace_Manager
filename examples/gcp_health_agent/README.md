# Agent Quickstart

This agent was created using the Gemini Enterprise Manager Agent Builder (ADK).

## Deployment

1.  **Install ADK:**
    ```sh
    pip install "google-cloud-aiplatform[adk,agent_engines]>=1.75.0"
    ```

2.  **Install dependencies:**
    ```sh
    pip install -r requirements.txt
    ```

3.  **Deploy to Vertex AI:**
    Ensure you have set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `STAGING_BUCKET` in your `.env` file.
    
    Run the deploy script:
    ```sh
    python deploy_re.py
    ```