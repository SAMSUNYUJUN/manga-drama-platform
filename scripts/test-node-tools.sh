#!/bin/bash

# Test script for node tools and workflow
# This script tests the three types of node tools:
# 1. Text to JSON (LLM)
# 2. Text to Image (nano-banana)
# 3. Text + Image to Image (nano-banana)

set -e

API_BASE="http://localhost:3001/api"
AUTH_TOKEN=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Login and get token
login() {
    log_info "Logging in as admin..."
    local response=$(curl -s -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')
    
    AUTH_TOKEN=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$AUTH_TOKEN" ]; then
        log_error "Failed to get auth token"
        echo "$response"
        exit 1
    fi
    
    log_info "Login successful"
}

# Test text-to-JSON node tool
test_text_to_json() {
    log_info "Testing Text-to-JSON node tool (ID: 1)..."
    
    local response=$(curl -s -X POST "$API_BASE/node-tools/1/test" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"inputs": {"novel_text": "小明是一个16岁的少年，有一头黑色短发，戴着眼镜。他的好朋友小红是一个活泼的女孩，长着棕色的马尾辫。"}}')
    
    local success=$(echo "$response" | grep -o '"success":true' || echo "")
    if [ -n "$success" ]; then
        log_info "✓ Text-to-JSON test passed"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        log_error "✗ Text-to-JSON test failed"
        echo "$response"
    fi
}

# Test text-to-image node tool (nano-banana)
test_text_to_image() {
    log_info "Testing Text-to-Image node tool (ID: 5)..."
    
    local response=$(curl -s -X POST "$API_BASE/node-tools/5/test" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"inputs": {"text": "一只可爱的小猫在阳光下玩耍"}}' \
        --max-time 180)
    
    local success=$(echo "$response" | grep -o '"success":true' || echo "")
    if [ -n "$success" ]; then
        log_info "✓ Text-to-Image test passed"
        # Check if mediaUrls contains image URL
        local image_url=$(echo "$response" | grep -o '"mediaUrls":\[[^]]*\]' || echo "")
        if [ -n "$image_url" ]; then
            log_info "Generated image URLs: $image_url"
        fi
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        log_error "✗ Text-to-Image test failed"
        echo "$response"
    fi
}

# Test text+image-to-image node tool (nano-banana)
test_image_to_image() {
    log_info "Testing Text+Image-to-Image node tool (ID: 7)..."
    
    # First, we need a sample image URL or base64
    # Using a sample public image URL for testing
    local sample_image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/220px-Cat_November_2010-1a.jpg"
    
    local response=$(curl -s -X POST "$API_BASE/node-tools/7/test" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"inputs\": {\"text\": \"把这只猫变成一只戴着帽子的猫\", \"image\": \"$sample_image_url\"}}" \
        --max-time 180)
    
    local success=$(echo "$response" | grep -o '"success":true' || echo "")
    if [ -n "$success" ]; then
        log_info "✓ Text+Image-to-Image test passed"
        local image_url=$(echo "$response" | grep -o '"mediaUrls":\[[^]]*\]' || echo "")
        if [ -n "$image_url" ]; then
            log_info "Generated image URLs: $image_url"
        fi
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    else
        log_error "✗ Text+Image-to-Image test failed"
        echo "$response"
    fi
}

# List existing node tools
list_node_tools() {
    log_info "Listing existing node tools..."
    
    curl -s "$API_BASE/node-tools" \
        -H "Authorization: Bearer $AUTH_TOKEN" | python3 -m json.tool 2>/dev/null
}

# Test workflow execution
test_workflow() {
    log_info "Testing workflow execution..."
    
    # Get the first workflow template
    local templates=$(curl -s "$API_BASE/workflows/templates" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    
    local template_id=$(echo "$templates" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
    
    if [ -z "$template_id" ]; then
        log_warn "No workflow templates found"
        return
    fi
    
    log_info "Found template ID: $template_id"
    
    # Get versions for the template
    local versions=$(curl -s "$API_BASE/workflows/templates/$template_id/versions" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    
    echo "$versions" | python3 -m json.tool 2>/dev/null || echo "$versions"
}

# Main execution
main() {
    echo "========================================"
    echo "Node Tools and Workflow Test Suite"
    echo "========================================"
    echo ""
    
    login
    echo ""
    
    list_node_tools
    echo ""
    
    if [ "$1" == "--quick" ]; then
        log_info "Quick mode: skipping API tests that require network"
        exit 0
    fi
    
    test_text_to_json
    echo ""
    
    test_text_to_image
    echo ""
    
    test_image_to_image
    echo ""
    
    test_workflow
    echo ""
    
    echo "========================================"
    echo "All tests completed"
    echo "========================================"
}

main "$@"
