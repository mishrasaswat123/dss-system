#!/bin/bash

echo "🚀 Starting DSS System..."

# Kill all existing node processes
echo "🛑 Killing existing Node processes..."
pkill -9 -f node
sleep 2

# Ensure we are in correct directory
cd ~/dss-system

# Create logs folder if not exists
mkdir -p logs

# Start services

echo "🧠 Starting Brain Service..."
node services/brain-service/index.js > logs/brain.log 2>&1 &

echo "📊 Starting Signal Engine..."
node services/signal-engine/index.js > logs/signal.log 2>&1 &

echo "⚠️ Starting Risk Engine..."
node services/risk-engine/index.js > logs/risk.log 2>&1 &

echo "⚙️ Starting Execution Service..."
node services/execution-service/index.js > logs/execution.log 2>&1 &

echo "📁 Starting Portfolio Service..."
node services/portfolio-service/index.js > logs/portfolio.log 2>&1 &

echo "🌐 Starting API Gateway..."
node api-gateway/index.js > logs/gateway.log 2>&1 &

echo "✅ All services started in background"

sleep 2

echo "🔍 Running services:"
ps aux | grep node
