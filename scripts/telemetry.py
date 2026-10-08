#!/usr/bin/env python3
"""Collect machine telemetry and POST it to the RedBlack server."""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import urllib.request
from datetime import datetime, timezone


def run_command(*args: str) -> str:
    result = subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def process_command(pid: int) -> str:
    output = run_command("ps", "-p", str(pid), "-o", "command=")
    return output or "unknown"


def collect_gpu() -> dict[str, object] | None:
    if shutil.which("nvidia-smi") is None:
        return None

    memory_output = run_command(
        "nvidia-smi",
        "--query-gpu=memory.used,memory.total",
        "--format=csv,noheader,nounits",
    )
    memory_values = [value.strip() for value in memory_output.split(",")]
    if len(memory_values) < 2:
        return None

    processes = []
    process_output = run_command(
        "nvidia-smi",
        "--query-compute-apps=pid,used_memory",
        "--format=csv,noheader,nounits",
    )
    for line in process_output.splitlines():
        values = [value.strip() for value in line.split(",")]
        if len(values) < 2 or not values[0].isdigit():
            continue

        pid = int(values[0])
        processes.append(
            {
                "pid": pid,
                "vramUsedMiB": int(values[1]),
                "command": process_command(pid),
            }
        )

    return {
        "vramUsedMiB": int(memory_values[0]),
        "vramTotalMiB": int(memory_values[1]),
        "processes": processes,
    }


def collect_cpu_processes() -> list[dict[str, object]]:
    output = run_command("ps", "-axo", "pid=,pcpu=,etime=,command=")
    processes = []
    for line in output.splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) < 4:
            continue

        try:
            cpu_percent = float(parts[1])
            pid = int(parts[0])
        except ValueError:
            continue

        if cpu_percent < 100:
            continue

        processes.append(
            {
                "pid": pid,
                "cpuPercent": cpu_percent,
                "elapsed": parts[2],
                "command": parts[3],
            }
        )

    return sorted(processes, key=lambda process: process["cpuPercent"], reverse=True)


def collect_telemetry() -> dict[str, object]:
    return {
        "machine": platform.node(),
        "platform": platform.platform(),
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "gpu": collect_gpu(),
        "cpuProcesses": collect_cpu_processes(),
    }


def send_telemetry(telemetry: dict[str, object]) -> None:
    url = os.environ.get("TELEMETRY_URL", "http://localhost:3000/machine-data")
    body = json.dumps(telemetry).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        print(f"Telemetry sent: HTTP {response.status}")


if __name__ == "__main__":
    payload = collect_telemetry()
    print(json.dumps(payload, indent=2))
    send_telemetry(payload)