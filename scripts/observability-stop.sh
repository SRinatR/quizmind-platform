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

echo "Stopping observability containers (if present)..."
for c in "${OBS[@]}"; do
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$c"; then
    docker stop "$c" >/dev/null 2>&1 || true
  fi
done

bash scripts/observability-status.sh
