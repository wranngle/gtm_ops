#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

if ! command -v docker >/dev/null 2>&1; then
  printf 'skip: docker CLI is not available; observability namespace isolation test not run\n' >&2
  exit 0
fi

if ! docker compose version >/dev/null 2>&1; then
  printf 'skip: docker compose is not available; observability namespace isolation test not run\n' >&2
  exit 0
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

project_a="obs-test-a-$$-${RANDOM}"
project_b="obs-test-b-$$-${RANDOM}"
config_a="$tmp_dir/${project_a}.json"
config_b="$tmp_dir/${project_b}.json"

render_config() {
  local project="$1"
  local output="$2"

  if ! OBSERVABILITY_PROJECT="$project" docker compose -p "$project" config --format json >"$output"; then
    printf 'failed: docker compose config failed for project %s\n' "$project" >&2
    printf 'command: OBSERVABILITY_PROJECT=%s docker compose -p %s config --format json\n' "$project" "$project" >&2
    return 1
  fi
}

render_config "$project_a" "$config_a"
render_config "$project_b" "$config_b"

python3 - "$project_a" "$config_a" "$project_b" "$config_b" <<'PY'
import json
import sys

project_a, config_a_path, project_b, config_b_path = sys.argv[1:]


def load_config(project, path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def fail(message, details=None):
    print(f"failed: {message}", file=sys.stderr)
    if details:
        print(details, file=sys.stderr)
    sys.exit(1)


def names_for(project, config):
    observed = {
        "project": [],
        "containers": [],
        "networks": [],
        "volumes": [],
    }
    errors = []

    project_name = config.get("name")
    observed["project"].append(project_name)
    if project_name != project:
        errors.append(f"compose project name: expected {project!r}, got {project_name!r}")

    services = config.get("services") or {}
    if not services:
        errors.append("services: expected at least one service")
    for service_name, service in sorted(services.items()):
        container_name = service.get("container_name")
        if not container_name:
            errors.append(f"service {service_name}: missing container_name")
            continue
        observed["containers"].append(container_name)
        if not container_name.startswith(f"{project}-"):
            errors.append(
                f"service {service_name}: container_name {container_name!r} "
                f"must start with {project + '-'!r}"
            )

    networks = config.get("networks") or {}
    if not networks:
        errors.append("networks: expected at least one resolved network")
    for network_key, network in sorted(networks.items()):
        network_name = (network or {}).get("name")
        if not network_name:
            errors.append(f"network {network_key}: missing resolved name")
            continue
        observed["networks"].append(network_name)
        if not network_name.startswith(f"{project}_"):
            errors.append(
                f"network {network_key}: name {network_name!r} "
                f"must start with {project + '_'!r}"
            )

    volumes = config.get("volumes") or {}
    if not volumes:
        errors.append("volumes: expected at least one resolved volume")
    for volume_key, volume in sorted(volumes.items()):
        volume_name = (volume or {}).get("name")
        if not volume_name:
            errors.append(f"volume {volume_key}: missing resolved name")
            continue
        observed["volumes"].append(volume_name)
        if not volume_name.startswith(f"{project}_"):
            errors.append(
                f"volume {volume_key}: name {volume_name!r} "
                f"must start with {project + '_'!r}"
            )

    if errors:
        detail_lines = [f"project {project} namespace errors:"]
        detail_lines.extend(f"- {error}" for error in errors)
        detail_lines.append("")
        detail_lines.append("observed names:")
        for surface, values in observed.items():
            detail_lines.append(f"- {surface}: {', '.join(str(value) for value in values)}")
        fail("observability compose names are not namespace-safe", "\n".join(detail_lines))

    return observed


config_a = load_config(project_a, config_a_path)
config_b = load_config(project_b, config_b_path)
observed_a = names_for(project_a, config_a)
observed_b = names_for(project_b, config_b)

shared_by_surface = []
for surface in ("project", "containers", "networks", "volumes"):
    shared = sorted(set(observed_a[surface]) & set(observed_b[surface]))
    if shared:
        shared_by_surface.append(f"- {surface}: {', '.join(shared)}")

if shared_by_surface:
    fail(
        "observability compose names collide across projects",
        "\n".join([
            f"project A: {project_a}",
            f"project B: {project_b}",
            "colliding names:",
            *shared_by_surface,
        ]),
    )

print(f"ok: observability namespace isolation holds for {project_a} and {project_b}")
PY
