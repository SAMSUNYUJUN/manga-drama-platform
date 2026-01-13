#!/bin/bash

echo "Testing nano-banana model..."
curl -X POST http://localhost:3001/api/node-tools/test \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text_to_image",
    "name": "Test Nano-Banana",
    "config": {
      "model": "nano-banana",
      "parameters": {
        "prompt": "一只可爱的小猫",
        "size": "1024x1024"
      }
    }
  }' | jq .
