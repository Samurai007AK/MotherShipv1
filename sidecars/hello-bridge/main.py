"""
Mothership — Hello Bridge (Sidecar Test)

A minimal Python sidecar that demonstrates the sidecar lifecycle.
Used to verify that Tauri can spawn, communicate with, and kill Python processes.

Protocol: JSON-RPC over stdin/stdout (one JSON object per line).

Commands:
  - ping: respond with {"jsonrpc": "2.0", "result": {"status": "ok", "message": "hello from sidecar"}}
  - echo: respond with the same message back
  - shutdown: exit gracefully
"""

import sys
import os
import logging

# Ensure shared package is importable regardless of working directory
_this_dir = os.path.dirname(os.path.abspath(__file__))
_shared_parent = os.path.abspath(os.path.join(_this_dir, '..'))
if _shared_parent not in sys.path:
    sys.path.insert(0, _shared_parent)

from shared.json_rpc_sidecar import JsonRpcSidecar

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("hello-bridge")

sidecar = JsonRpcSidecar("hello-bridge", logger)


@sidecar.method("ping")
def handle_ping(params: dict, req_id):
    return sidecar.ok(
        {"status": "ok", "message": "hello from sidecar", "pid": __import__("os").getpid()},
        req_id,
    )


@sidecar.method("echo")
def handle_echo(params: dict, req_id):
    return sidecar.ok({"echo": params.get("message", "")}, req_id)


if __name__ == "__main__":
    sidecar.run()
