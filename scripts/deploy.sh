#!/bin/bash

# Habs Meet Deployment Script
# Usage: ./scripts/deploy.sh [dev|prod]

set -e

ENVIRONMENT=${1:-dev}

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "prod" ]; then
    echo "❌ Invalid environment. Use 'dev' or 'prod'"
    echo "Usage: ./scripts/deploy.sh [dev|prod]"
    exit 1
fi

echo "🚀 Deploying Habs Meet to $ENVIRONMENT environment..."

# Set Firebase project
if [ "$ENVIRONMENT" = "dev" ]; then
    PROJECT="habs-meet-dev"
else
    PROJECT="habs-meet-prod"
fi

echo "📋 Using Firebase project: $PROJECT"

# Switch to project
firebase use $PROJECT

# Build web app
echo "🔨 Building web application..."
cd apps/web
pnpm build
cd ../..

# Deploy to Firebase
echo "☁️ Deploying to Firebase..."
firebase deploy --only hosting,functions

echo "✅ Deployment completed successfully!"
echo "🌐 Your app is now live at: https://$PROJECT.web.app"

# Show useful commands
echo ""
echo "📝 Useful commands:"
echo "  View logs: firebase functions:log"
echo "  Open app: firebase open hosting:site"
echo "  Emulator: firebase emulators:start"



