# Connectors Authentication Guide

This guide explains how to obtain the necessary refresh tokens for setting up third-party data connectors in Discovery Engine using `curl`.

## Atlassian Connectors (Jira / Confluence)

To get a long-lived refresh token for non-interactive authentication:
1. Ensure your app in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) has the **`offline_access`** scope enabled.
2. Visit the authorization URL in your browser to get a code (ensure you use a valid redirect URI configured in your app):
   ```text
   https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=YOUR_CLIENT_ID&scope=read%3Ajira-work%20offline_access&redirect_uri=YOUR_REDIRECT_URI&state=random_string&response_type=code&prompt=consent
   ```
3. Exchange the code for tokens using a `curl` command:
   ```bash
   curl --request POST \
     --url 'https://auth.atlassian.com/oauth/token' \
     --header 'Content-Type: application/json' \
     --data '{
       "grant_type": "authorization_code",
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "code": "THE_CODE",
       "redirect_uri": "YOUR_REDIRECT_URI"
     }'
   ```
4. The response will contain the `refresh_token`.

## Microsoft Connectors (SharePoint / Teams / Outlook)

To get a refresh token for Microsoft connectors:
1. **Ensure `offline_access` scope**: When registering the app or constructing the authorization URL, ensure the `offline_access` scope is included.
2. **Get Authorization Code**: Visit the following URL in your browser:
   ```text
   https://login.microsoftonline.com/{YOUR_TENANT_ID}/oauth2/v2.0/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI&response_mode=query&scope=offline_access%20https%3A%2F%2Fgraph.microsoft.com%2F.default&state=12345
   ```
   *Note: Replace `{YOUR_TENANT_ID}` in the path with your actual Tenant ID.*
3. **Exchange Code for Tokens**:
   ```bash
   curl -X POST https://login.microsoftonline.com/{YOUR_TENANT_ID}/oauth2/v2.0/token \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "scope=offline_access https://graph.microsoft.com/.default" \
     -d "code=THE_CODE_FROM_STEP_2" \
     -d "redirect_uri=YOUR_REDIRECT_URI" \
     -d "grant_type=authorization_code" \
     -d "client_secret=YOUR_CLIENT_SECRET"
   ```
4. The response will contain the `refresh_token`.
