#!/bin/bash

echo "🔍 Codex Status Check"
echo "===================="

# Check if server is running
if lsof -i:3000 > /dev/null 2>&1; then
    echo "✅ Server is running on port 3000"
    PID=$(lsof -ti:3000)
    echo "   Process ID: $PID"
else
    echo "❌ Server is NOT running"
    echo "   Run: ./start-dev.sh"
    exit 1
fi

# Test endpoints
echo ""
echo "📡 Testing endpoints:"

# Health check
HEALTH=$(curl -s http://localhost:3000/api/health 2>/dev/null)
if [[ $? -eq 0 ]]; then
    echo "✅ Health check: OK"
else
    echo "❌ Health check: FAILED"
fi

# Homepage
HOME=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
if [[ $HOME -eq 200 ]]; then
    echo "✅ Homepage: OK"
else
    echo "❌ Homepage: FAILED (HTTP $HOME)"
fi

# Check for errors in logs
echo ""
echo "📋 Recent errors:"
grep -i error dev.log | tail -5 || echo "   No recent errors"

echo ""
echo "🌐 Access the application at: http://localhost:3000"
echo ""