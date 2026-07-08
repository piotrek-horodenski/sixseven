#!/bin/bash

# image.build.sh
# Check if the Dockerfile exists
if [ ! -f Dockerfile ]; then
    echo "Error: Dockerfile not found."
    exit 1
fi

# Get current date and time
build_date=$(date +"%Y%m%d%H%M%S")

# Extract version from src/consts/version.const.ts
himage2_version=$(awk -F"['\"]" '/version/{print $2}' src/consts/version.const.ts)

# Check if version is extracted successfully
if [ -z "$himage2_version" ]; then
    echo "Error: Could not extract version from src/consts/version.const.ts"
    exit 1
fi

# Create and display the final tag
himage2_tag="$himage2_version.$build_date"
echo "himage2 tag: $himage2_tag"

# Build the Docker image with a tag consisting of date, time, and version
docker build --no-cache -f Dockerfile -t himage2:$himage2_tag .
