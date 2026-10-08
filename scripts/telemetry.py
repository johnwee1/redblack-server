#!/usr/bin/env python3
"""Collect machine telemetry and POST it to a remote server.
Stats are viewable at https://redblack-server.onrender.com/
"""

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


def get_process_info(pid: int) -> dict[str, str]:
    output = run_command("ps", "-p", str(pid), "-o", "user=,etime=,command=")
    if not output:
        return {"user": "unknown", "elapsed": "unknown", "command": "unknown"}
    parts = output.strip().split(None, 2)
    if len(parts) < 3:
        return {
            "user": parts[0] if len(parts) > 0 else "unknown",
            "elapsed": parts[1] if len(parts) > 1 else "unknown",
            "command": "unknown",
        }
    return {
        "user": parts[0],
        "elapsed": parts[1],
        "command": parts[2],
    }


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
        proc_info = get_process_info(pid)
        processes.append(
            {
                "pid": pid,
                "user": proc_info["user"],
                "elapsed": proc_info["elapsed"],
                "vramUsedMiB": int(values[1]),
                "command": proc_info["command"],
            }
        )

    return {
        "vramUsedMiB": int(memory_values[0]),
        "vramTotalMiB": int(memory_values[1]),
        "processes": processes,
    }


def collect_cpu_processes() -> list[dict[str, object]]:
    output = run_command("ps", "-axo", "user=,pid=,pcpu=,etime=,command=")
    processes = []
    for line in output.splitlines():
        parts = line.strip().split(None, 4)
        if len(parts) < 5:
            continue

        try:
            cpu_percent = float(parts[2])
            pid = int(parts[1])
        except ValueError:
            continue

        if cpu_percent < 100:
            continue

        processes.append(
            {
                "pid": pid,
                "user": parts[0],
                "cpuPercent": cpu_percent,
                "elapsed": parts[3],
                "command": parts[4],
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
    url = os.environ.get(
        "TELEMETRY_URL", "https://redblack-server.onrender.com/machine-data"
    )
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
