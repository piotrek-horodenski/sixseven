#!/bin/bash
# image.save.sh

# Get the latest tag
latest_image_id=$(docker images himage2 --format "{{.ID}} {{.CreatedAt}}" | sort -k2 -r | head -n 1 | awk '{print $1}')

# Check if there are any tags
if [ -z "$latest_image_id" ]; then
    echo "No tags found for the image."
    exit 1
fi

image_details=$(docker images himage2 --format "Repository: {{.Repository}} Tag: {{.Tag}} ID: {{.ID}} Created: {{.CreatedAt}}" | grep $latest_image_id)

# Check if metadata is empty
if [ -z "$image_details" ]; then
    echo "No metadata found for the image."
    exit 1
fi

# Display the metadata
echo "Latest image ID: $latest_image_id"
echo "$image_details"

# Get the latest tag
latest_tag=$(echo $image_details | awk -F 'Tag: ' '{print $2}' | awk '{print $1}')

# Set filename with the latest tag
filename="himage2_$latest_tag.tar"

# Save the image with the latest tag
echo saving image with tag $latest_tag
docker save -o $filename himage2:$latest_tag

# check if the file exists
if [ ! -f $filename ]; then
    echo "file $filename does not exist"
    exit 1
fi

# compress the image
echo compressing the image with gzip
gzip -f $filename

# check exit status
if [ $? -ne 0 ]; then
    echo "Error compressing the image"
    exit 1
fi

echo "Image with tag: $latest_tag saved as $filename.gz Successfully"
exit 0
