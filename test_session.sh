#!/bin/bash
source .env

APP_ID="YOUR_APP_ID" # NEED TO FIND
LOCATION="global"
PROJECT="YOUR_PROJECT" # NEED TO FIND
URL="https://discoveryengine.googleapis.com/v1alpha/projects/$PROJECT/locations/$LOCATION/collections/default_collection/engines/$APP_ID/sessions"

TOKEN=$(gcloud auth print-access-token)

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userPseudoId": "test-user@google.com",
    "state": "IN_PROGRESS",
    "turns": [
      {
         "query": { "text": "Hello" },
         "answer": { "answerText": "Hi there" }
      }
    ]
  }' \
  $URL
