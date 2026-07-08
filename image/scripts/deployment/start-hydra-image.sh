# start hydra-image pod
podman pod start hydra-image
echo "pod list"
podman pod ls
echo "running container list"
podman ps
echo "volume list"
podman volume ls

