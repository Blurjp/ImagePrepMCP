#!/bin/bash

# Test Railway Redis Persistence
# Run this before and after redeploying to verify persistence

echo "=== Railway Redis Persistence Test ==="
echo ""

HEALTH_URL="https://figma-smart-image-mcp-production.up.railway.app/health"

echo "1. Current health status:"
curl -s "$HEALTH_URL" | jq '.'
echo ""

# Get current OAuth session count
SESSION_COUNT=$(curl -s "$HEALTH_URL" | jq -r '.oauthSessionCount')
echo "Current OAuth sessions: $SESSION_COUNT"
echo ""

if [ "$SESSION_COUNT" -eq 0 ]; then
  echo "⚠️  No OAuth sessions found. Creating a test session..."

  # Generate a device code
  DEVICE_RESPONSE=$(curl -s -X POST "https://figma-smart-image-mcp-production.up.railway.app/device/authorize" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=test_persistence")

  DEVICE_CODE=$(echo "$DEVICE_RESPONSE" | jq -r '.device_code')
  USER_CODE=$(echo "$DEVICE_RESPONSE" | jq -r '.user_code')

  echo "   Device Code: $DEVICE_CODE"
  echo "   User Code: $USER_CODE"
  echo ""
  echo "   To complete the test:"
  echo "   1. Visit: https://figma-smart-image-mcp-production.up.railway.app/"
  echo "   2. Authenticate with User Code: $USER_CODE"
  echo "   3. Run this script again to verify"
  echo ""
  echo "   Or use API (replace YOUR_TOKEN):"
  echo "   curl -X POST 'https://figma-smart-image-mcp-production.up.railway.app/auth' \\"
  echo "     -H 'Content-Type: application/x-www-form-urlencoded' \\"
  echo "     -d 'user_code=$USER_CODE&token=YOUR_FIGMA_TOKEN'"
else
  echo "✅ OAuth sessions found: $SESSION_COUNT"
  echo ""
  echo "To test persistence:"
  echo "1. Trigger a redeploy on Railway (push a commit or manual redeploy)"
  echo "2. Run this script again after redeploy"
  echo "3. If oauthSessionCount > 0, persistence is working!"
fi
