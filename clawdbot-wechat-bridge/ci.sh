#!/bin/bash
#
# CI/CD Script for Clawdbot WeChat Bridge
# Usage: ./ci.sh [--no-cache]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting CI/CD Pipeline...${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
NO_CACHE=""
if [[ "$1" == "--no-cache" ]]; then
    NO_CACHE="--no-cache"
    echo -e "${YELLOW}📦 Build mode: no-cache${NC}"
fi

# Step 1: Pull latest code
echo -e "${YELLOW}📥 Pulling latest code from git...${NC}"
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || git pull

# Step 2: Stop services
echo -e "${YELLOW}🛑 Stopping services...${NC}"
docker-compose down || true

# Step 3: Build images
echo -e "${YELLOW}🔨 Building Docker images...${NC}"
docker-compose build $NO_CACHE

# Step 4: Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"
docker-compose up -d

# Step 5: Show status
echo -e "${YELLOW}📊 Service status:${NC}"
docker-compose ps

# Step 6: Show recent logs
echo -e "${YELLOW}📋 Recent logs:${NC}"
docker-compose logs --tail=20

echo -e "${GREEN}✅ CI/CD Pipeline completed successfully!${NC}"
echo -e "${GREEN}   Use 'docker-compose logs -f' to watch logs${NC}"
