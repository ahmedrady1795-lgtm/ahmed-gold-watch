#!/usr/bin/env python3
"""Fail closed if the cheap Oracle profile accidentally enables risky services."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
compose = [
    "docker", "compose",
    "--env-file", "deploy/oracle/.env.example",
    "-f", "deploy/oracle/compose.yaml",
]
def config(*extra):
    raw = subprocess.check_output(compose + list(extra) + ["config", "--format", "json"], cwd=root)
    return json.loads(raw)

default = config()
services = default["services"]
assert set(services) == {"web", "ml", "worker"}, sorted(services)
assert services["web"]["environment"]["MT5_AUTOTRADE_ENABLED"] == "false"
assert services["web"]["environment"]["KILL_SWITCH_ENABLED"] == "true"
assert services["web"]["environment"]["NEURAL_ENGINE_URL"] == ""
assert services["worker"]["environment"]["LEARNING_INTERVAL_MS"] == "10000"
assert services["worker"]["environment"]["SCALP_PULSE_INTERVAL_MS"] == "5000"
assert services["worker"]["environment"]["SCALP_PULSE_ENABLED"] == "1"
assert "ports" not in services["ml"], "ML must remain on the private Docker network"
assert "ports" not in services["worker"], "Worker must remain private"
assert all(p.get("host_ip") == "127.0.0.1" for p in services["web"]["ports"])
assert any(v.get("target") == "/data" for v in services["web"]["volumes"])
assert any(v.get("target") == "/data" for v in services["ml"]["volumes"])
assert "neural" not in services
assert "caddy" not in services
opt = config("--profile", "neural", "--profile", "public")
assert {"web", "ml", "worker", "neural", "caddy"} == set(opt["services"])
assert not opt["services"]["neural"].get("ports")
assert sorted(p.get("published") for p in opt["services"]["caddy"]["ports"]) == ["443", "80"]
print("PASS: Oracle default excludes Neural and public port exposure, keeps paper trading and persistence")
