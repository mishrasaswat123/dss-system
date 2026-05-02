#!/bin/bash

echo "⚠️ Restoring D23..."

# Restore backend
cp restore_points/D23/backend/server.js /home/ubuntu/dss-system/server.js

# Restore frontend
sudo cp restore_points/D23/frontend/index.html /var/www/html/index.html

# Restart backend
pm2 restart dss

echo "✅ D23 Restore Complete"
