#\!/bin/bash

echo "🚀 Starting Codex Development Server..."

# Kill any existing processes on port 3000
lsof -ti:3000  < /dev/null |  xargs kill -9 2>/dev/null

# Clear any previous logs
rm -f dev.log

# Start the server in the background
nohup npm run dev > dev.log 2>&1 &
SERVER_PID=$!

echo "⏳ Waiting for server to start..."

# Wait for server to be ready
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if grep -q "Ready in" dev.log 2>/dev/null; then
        echo "✅ Server is ready!"
        break
    fi
    
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
    echo -n "."
done

echo ""

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "❌ Server failed to start in 30 seconds"
    cat dev.log
    exit 1
fi

# Test the server
echo "🧪 Testing server..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)

if [ "$RESPONSE" = "200" ]; then
    echo "✅ Server is running successfully!"
    echo ""
    echo "🌐 Application URL: http://localhost:3000"
    echo "📝 Logs: tail -f dev.log"
    echo "🛑 Stop: kill $SERVER_PID"
    echo ""
    echo "Server PID: $SERVER_PID"
else
    echo "❌ Server test failed (HTTP $RESPONSE)"
    cat dev.log
    kill $SERVER_PID
    exit 1
fi
