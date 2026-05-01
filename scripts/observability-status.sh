#!/usr/bin/env bash
set -euo pipefail

OBS=(
  quizmind-prometheus
  quizmind-grafana
  quizmind-loki
  quizmind-alertmanager
  quizmind-blackbox-exporter
  quizmind-cadvisor
  quizmind-node-exporter
  quizmind-redis-exporter
  quizmind-postgres-exporter
  quizmind-alloy
)

echo "Observability container status:"
running=()
for c in "${OBS[@]}"; do
  if docker ps --format '{{.Names}}' | grep -Fxq "$c"; then
    echo "  $c: running"
    running+=("$c")
  elif docker ps -a --format '{{.Names}}' | grep -Fxq "$c"; then
    echo "  $c: stopped"
  else
    echo "  $c: missing"
  fi
done

if [[ ${#running[@]} -gt 0 ]]; then
  echo ""
  echo "docker stats snapshot:"
  docker stats --no-stream "${running[@]}"
fi
