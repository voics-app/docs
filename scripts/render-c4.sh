#!/usr/bin/env bash
# Renders every view in c4/workspace.dsl to SVG and PNG under c4/rendered/.
#
#   1. structurizr/cli exports each view to C4-PlantUML (.puml)
#   2. plantuml/plantuml renders the .puml files to SVG and PNG
#
# Requires Docker. Image versions are pinned so CI and laptops produce
# identical output; bump them deliberately.
set -euo pipefail

STRUCTURIZR_IMAGE="${STRUCTURIZR_IMAGE:-structurizr/cli:2025.11.09}"
PLANTUML_IMAGE="${PLANTUML_IMAGE:-plantuml/plantuml:1.2026.8}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
c4_dir="${repo_root}/c4"
export_dir="${c4_dir}/.export"
rendered_dir="${c4_dir}/rendered"

# Git Bash on Windows rewrites /paths in docker arguments; disable that and
# hand docker a native path for the bind mount.
export MSYS_NO_PATHCONV=1
mount_src="${c4_dir}"
if command -v cygpath >/dev/null 2>&1; then
  mount_src="$(cygpath -w "${c4_dir}")"
fi

rm -rf "${export_dir}"
mkdir -p "${export_dir}" "${rendered_dir}"

echo "==> Exporting views with ${STRUCTURIZR_IMAGE}"
docker run --rm --user "$(id -u):$(id -g)" \
  -v "${mount_src}:/c4" \
  "${STRUCTURIZR_IMAGE}" export \
  -workspace /c4/workspace.dsl \
  -format plantuml/c4plantuml \
  -output /c4/.export

# Hand-written UML class diagrams that complement the C4 code views.
cp "${c4_dir}"/code/*.puml "${export_dir}/"

echo "==> Rendering with ${PLANTUML_IMAGE}"
for format in svg png; do
  docker run --rm --user "$(id -u):$(id -g)" \
    -v "${mount_src}:/c4" \
    "${PLANTUML_IMAGE}" "-t${format}" -failfast2 -o /c4/rendered "/c4/.export/*.puml"
done

# Keep the exported sources next to the images for review diffs.
rm -f "${rendered_dir}"/*.puml
cp "${export_dir}"/*.puml "${rendered_dir}/"
rm -rf "${export_dir}"

echo "==> Rendered $(find "${rendered_dir}" -name '*.svg' | wc -l) diagrams into c4/rendered/"
