#!/bin/bash
#
# Run the latest release Docker image with local PostgreSQL and optional Caddy SSL proxy
#
# Usage:
#   ./run-release.sh           # Run latest release (with Caddy if available)
#   ./run-release.sh v2.0.2    # Run specific version
#   ./run-release.sh stop      # Stop running container and Caddy
#   ./run-release.sh logs      # View container logs
#   ./run-release.sh status    # Show status of container and Caddy
#
# Environment variables:
#   PORT=3000          # Application port (default: 3000)
#   SSL_PORT=3443      # Caddy SSL port (default: 3443)
#   NO_CADDY=1         # Disable Caddy even if installed
#
# Supports Docker Desktop and Rancher Desktop on macOS
# Note: For Rancher Desktop, PostgreSQL must listen on all interfaces
#

set -e

CONTAINER_NAME="ostsee-tiere-release"
IMAGE_BASE="ghcr.io/jansinger/ostsee-sichtung"
VERSION="${1:-latest}"
PORT="${PORT:-3000}"
SSL_PORT="${SSL_PORT:-3443}"
CADDY_PID_FILE="/tmp/ostsee-caddy.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if Caddy is available
has_caddy() {
    [ -z "$NO_CADDY" ] && command -v caddy >/dev/null 2>&1
}

# Stop Caddy if running
stop_caddy() {
    if [ -f "$CADDY_PID_FILE" ]; then
        local pid
        pid=$(cat "$CADDY_PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Stopping Caddy (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 1
        fi
        rm -f "$CADDY_PID_FILE"
    fi
    # Also kill any orphaned caddy processes for this port
    pkill -f "caddy reverse-proxy.*:$SSL_PORT" 2>/dev/null || true
}

# Start Caddy as reverse proxy with automatic HTTPS
start_caddy() {
    if ! has_caddy; then
        return 1
    fi

    stop_caddy

    echo -e "${BLUE}Starting Caddy reverse proxy on https://localhost:$SSL_PORT${NC}"

    # Start Caddy in background with reverse proxy to app
    caddy reverse-proxy \
        --from "localhost:$SSL_PORT" \
        --to "localhost:$PORT" \
        --internal-certs \
        >/dev/null 2>&1 &

    local caddy_pid=$!
    echo "$caddy_pid" > "$CADDY_PID_FILE"

    # Wait a moment and verify Caddy started
    sleep 1
    if kill -0 "$caddy_pid" 2>/dev/null; then
        echo -e "${GREEN}✓ Caddy started (PID: $caddy_pid)${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Caddy failed to start${NC}"
        rm -f "$CADDY_PID_FILE"
        return 1
    fi
}

# Detect Docker runtime (Docker Desktop vs Rancher Desktop)
detect_docker_runtime() {
    if docker context show 2>/dev/null | grep -q "rancher-desktop"; then
        echo "rancher"
    elif docker info 2>/dev/null | grep -q "rancher"; then
        echo "rancher"
    else
        echo "docker"
    fi
}

# Get host IP for database connection (needed for Rancher Desktop)
get_host_ip() {
    if command -v ifconfig >/dev/null 2>&1; then
        ifconfig en0 2>/dev/null | grep "inet " | awk '{print $2}' | head -1
    elif command -v ip >/dev/null 2>&1; then
        ip route get 1 2>/dev/null | awk '{print $7}' | head -1
    else
        echo "127.0.0.1"
    fi
}

# Handle commands
case "$VERSION" in
    stop)
        echo -e "${YELLOW}Stopping services...${NC}"
        stop_caddy
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        echo -e "${GREEN}All services stopped.${NC}"
        exit 0
        ;;
    logs)
        docker logs -f "$CONTAINER_NAME"
        exit 0
        ;;
    status)
        echo -e "${BLUE}Container status:${NC}"
        docker ps -f "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo -e "${BLUE}Caddy status:${NC}"
        if [ -f "$CADDY_PID_FILE" ]; then
            CADDY_PID=$(cat "$CADDY_PID_FILE" 2>/dev/null)
            if [ -n "$CADDY_PID" ] && kill -0 "$CADDY_PID" 2>/dev/null; then
                echo -e "  ${GREEN}Running${NC} (PID: $CADDY_PID) on https://localhost:$SSL_PORT"
            else
                echo -e "  ${RED}Not running${NC}"
            fi
        else
            echo -e "  ${YELLOW}Not configured${NC}"
        fi
        exit 0
        ;;
esac

# Check if .env exists
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file with required configuration"
    exit 1
fi

# Load .env file
set -a
source "$SCRIPT_DIR/.env"
set +a

# Check required environment variables
if [ -z "$AUTH0_CLIENT_ID" ] || [ "$AUTH0_CLIENT_ID" = "your-auth0-client-id" ]; then
    echo -e "${YELLOW}Warning: AUTH0_CLIENT_ID not configured - authentication will not work${NC}"
fi

# Detect Docker runtime
DOCKER_RUNTIME=$(detect_docker_runtime)
HOST_IP=$(get_host_ip)

echo -e "${BLUE}Detected Docker runtime: $DOCKER_RUNTIME${NC}"

# For Rancher Desktop, replace localhost with host IP in DATABASE_POSTGRES_URL
if [ "$DOCKER_RUNTIME" = "rancher" ]; then
    echo -e "${YELLOW}Rancher Desktop detected - adjusting database connection${NC}"
    DOCKER_DATABASE_URL=$(echo "$DATABASE_POSTGRES_URL" | sed "s/@localhost:/@$HOST_IP:/g" | sed "s/@127\.0\.0\.1:/@$HOST_IP:/g")
    echo -e "${BLUE}Host IP: $HOST_IP${NC}"
    echo -e "${YELLOW}Note: PostgreSQL must be configured to accept connections from Docker${NC}"
else
    DOCKER_DATABASE_URL="$DATABASE_POSTGRES_URL"
fi

# Stop existing container if running
if docker ps -q -f "name=$CONTAINER_NAME" | grep -q .; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop "$CONTAINER_NAME" >/dev/null
    docker rm "$CONTAINER_NAME" >/dev/null
fi

# Pull the image
IMAGE="$IMAGE_BASE:$VERSION"
echo -e "${GREEN}Pulling image: $IMAGE${NC}"
docker pull "$IMAGE"

# Ensure uploads directory exists
mkdir -p "$SCRIPT_DIR/uploads"

# Determine public URL: use Caddy HTTPS URL if available, otherwise use configured or default
if has_caddy; then
    APP_PUBLIC_URL="https://localhost:$SSL_PORT"
else
    APP_PUBLIC_URL="${PUBLIC_SITE_URL:-http://localhost:$PORT}"
fi

echo ""
echo -e "${GREEN}Starting Ostsee-Tiere Release${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Runtime:   $DOCKER_RUNTIME"
echo "Image:     $IMAGE"
echo "App Port:  http://localhost:$PORT"
if has_caddy; then
    echo "SSL Port:  https://localhost:$SSL_PORT (Caddy)"
fi
echo "Public:    $APP_PUBLIC_URL"
echo "Uploads:   $SCRIPT_DIR/uploads"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the container
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$PORT:$PORT" \
    --user "$(id -u):$(id -g)" \
    -v "$SCRIPT_DIR/uploads:/app/uploads" \
    --entrypoint "" \
    -e PORT="$PORT" \
    -e DATABASE_POSTGRES_URL="$DOCKER_DATABASE_URL" \
    -e STORAGE_PROVIDER="${STORAGE_PROVIDER:-local}" \
    -e NODE_ENV="production" \
    -e PUBLIC_SITE_URL="$APP_PUBLIC_URL" \
    -e SESSION_SECRET="${SESSION_SECRET}" \
    -e ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
    -e COOKIE_NAME="${COOKIE_NAME:-auth-cookie}" \
    -e AUTH0_CLIENT_ID="${AUTH0_CLIENT_ID}" \
    -e AUTH0_CLIENT_SECRET="${AUTH0_CLIENT_SECRET}" \
    -e AUTH0_DOMAIN="${AUTH0_DOMAIN}" \
    -e JWKS_URL="${JWKS_URL}" \
    -e API_AUDIENCE="${API_AUDIENCE}" \
    -e SKIP_STORAGE_CHECK="true" \
    "$IMAGE" \
    node build/index.js

echo -e "${GREEN}Container started!${NC}"

# Wait for application to be healthy
echo "Waiting for application to start..."
sleep 2

APP_HEALTHY=false
for i in {1..30}; do
    if curl -s -f "http://localhost:$PORT/health" >/dev/null 2>&1; then
        APP_HEALTHY=true
        echo -e "${GREEN}✓ Application is healthy${NC}"
        break
    fi
    sleep 1
done

if [ "$APP_HEALTHY" = false ]; then
    if docker ps -q -f "name=$CONTAINER_NAME" | grep -q .; then
        echo -e "${YELLOW}Application may still be starting. Check logs with: ./run-release.sh logs${NC}"
    else
        echo -e "${RED}✗ Container failed to start. Check logs:${NC}"
        docker logs "$CONTAINER_NAME"
        exit 1
    fi
fi

# Start Caddy if available
CADDY_STARTED=false
if has_caddy; then
    if start_caddy; then
        CADDY_STARTED=true
    fi
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$CADDY_STARTED" = true ]; then
    echo -e "${GREEN}Application available at: https://localhost:$SSL_PORT${NC}"
    echo -e "${BLUE}  (also http://localhost:$PORT without SSL)${NC}"
else
    echo -e "${GREEN}Application available at: http://localhost:$PORT${NC}"
    if [ -z "$NO_CADDY" ]; then
        echo -e "${YELLOW}  Tip: Install Caddy for automatic HTTPS: brew install caddy${NC}"
    fi
fi
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Commands:"
echo "  ./run-release.sh logs    - View logs"
echo "  ./run-release.sh stop    - Stop all services"
echo "  ./run-release.sh status  - Check status"
echo ""
