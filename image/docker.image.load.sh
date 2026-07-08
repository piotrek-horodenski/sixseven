#!/bin/bash

# check if the file exists
last_image_file=$(ls -t himage2_*.tar* | head -1)

# print the last file name 
echo Loading file $last_image_file
docker image load -i $last_image_file

