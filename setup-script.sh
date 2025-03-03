#!/bin/bash

echo "Setting up ely-file-manager environment..."

# Create storage directory if it doesn't exist
if [ ! -d "/opt/storage" ]; then
  echo "Creating /opt/storage directory..."
  sudo mkdir -p /opt/storage
fi

# Ensure proper permissions
echo "Setting permissions for /opt/storage..."
sudo chmod 777 /opt/storage

# Create local folders for Docker volumes
echo "Creating local folders for Docker volumes..."
mkdir -p ./uploads ./metadata ./files_to_manage

# Clean up any existing containers
echo "Cleaning up existing containers..."
docker-compose down -v

# Build and start containers
echo "Building and starting containers..."
docker-compose up --build -d

# Watch logs to check for startup issues
echo "Watching container logs (press Ctrl+C to exit)..."
docker-compose logs -f