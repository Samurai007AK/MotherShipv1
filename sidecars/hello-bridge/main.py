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
import json
import signal
import logging

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("hello-bridge")

running = True


def handle_signal(signum, frame):
    global running
    logger.info("Received signal %s, shutting down...", signum)
    running = False


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


def make_response(result, req_id=None):
    resp = {"jsonrpc": "2.0", "result": result}
    if req_id is not None:
        resp["id"] = req_id
    return resp


def make_error(message, code=-32603, req_id=None):
    resp = {"jsonrpc": "2.0", "error": {"code": code, "message": message}}
    if req_id is not None:
        resp["id"] = req_id
    return resp


def handle_request(req):
    method = req.get("method", "")
    params = req.get("params", {})
    req_id = req.get("id")

    if method == "ping":
        return make_response(
            {"status": "ok", "message": "hello from sidecar", "pid": sys.modules["os"].getpid()},
            req_id,
        )
    elif method == "echo":
        return make_response({"echo": params.get("message", "")}, req_id)
    elif method == "shutdown":
        global running
        running = False
        return make_response({"status": "shutting down"}, req_id)
    elif method == "health":
        return make_response({"status": "healthy", "uptime": "ok"}, req_id)
    else:
        return make_error(f"Unknown method: {method}", -32601, req_id)


def main():
    logger.info("hello-bridge started (pid=%d)", __import__("os").getpid())

    # Send ready signal
    ready = {"jsonrpc": "2.0", "method": "ready", "params": {"pid": __import__("os").getpid()}}
    sys.stdout.write(json.dumps(ready) + "\n")
    sys.stdout.flush()

    while running:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            line = line.strip()
            if not line:
                continue

            req = json.loads(line)
            resp = handle_request(req)
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()

        except json.JSONDecodeError as e:
            err = make_error(f"Invalid JSON: {e}")
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
        except Exception as e:
            logger.error("Error: %s", e)
            err = make_error(str(e))
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()

    logger.info("hello-bridge exited")


if __name__ == "__main__":
    main()
