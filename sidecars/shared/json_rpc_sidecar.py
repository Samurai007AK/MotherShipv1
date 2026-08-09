"""
Mothership — Shared JSON-RPC Sidecar Framework
================================================

Extracts the ~80 lines of lifecycle boilerplate duplicated across every
Python sidecar into a single reusable class.

Usage:
    from shared.json_rpc_sidecar import JsonRpcSidecar

    sidecar = JsonRpcSidecar("my-service")

    @sidecar.method("do_thing")
    def handle_do_thing(params: dict, req_id) -> dict:
        result = do_something(params)
        return sidecar.ok(result, req_id)

    sidecar.run()

This eliminates:
  - Signal handler registration (SIGINT/SIGTERM)
  - JSON-RPC response/error builders
  - Stdin read loop with dispatch
  - Ready signal on startup
  - UTF-8 encoding setup
  - Logging configuration
"""

import sys
import json
import signal
import logging
import os
import traceback
from typing import Callable, Optional


class JsonRpcSidecar:
    """A framework for building JSON-RPC 2.0 sidecars over stdin/stdout.

    Typical lifecycle:
      1. Create the sidecar with a service name.
      2. Register method handlers with @sidecar.method("method_name") or register().
      3. Call run() to start the read loop.

    Built-in methods (auto-registered):
      - health: returns {"status": "healthy", "pid": ...}
      - shutdown: sets running = False, returns confirmation
    """

    def __init__(self, name: str, logger: Optional[logging.Logger] = None):
        self.name = name
        self.logger = logger or logging.getLogger(name)
        self.running = True
        self._handlers: dict[str, Callable] = {}

        # Register built-in methods
        self._handlers["health"] = self._handle_health
        self._handlers["shutdown"] = self._handle_shutdown

    # ── Public API ──────────────────────────────────────────────────────────

    def register(self, method: str, handler: Callable):
        """Register a handler for the given JSON-RPC method name."""
        self._handlers[method] = handler

    def has_method(self, method: str) -> bool:
        """Check if a handler is registered for the given method name."""
        return method in self._handlers

    def method(self, method: str):
        """Decorator to register a handler for the given JSON-RPC method name."""
        def wrapper(handler):
            self.register(method, handler)
            return handler
        return wrapper

    def ok(self, result, req_id=None) -> dict:
        """Build a JSON-RPC success response."""
        resp = {"jsonrpc": "2.0", "result": result}
        if req_id is not None:
            resp["id"] = req_id
        return resp

    def error(self, message: str, code: int = -32603, req_id=None) -> dict:
        """Build a JSON-RPC error response."""
        resp = {"jsonrpc": "2.0", "error": {"code": code, "message": message}}
        if req_id is not None:
            resp["id"] = req_id
        return resp

    def run(self, stdin=None, stdout=None, stderr=None):
        """Start the sidecar's main read loop.

        Args:
            stdin:  Input stream (defaults to sys.stdin).
            stdout: Output stream (defaults to sys.stdout).
            stderr: Error stream (defaults to sys.stderr).
        """
        stdin = stdin or sys.stdin
        stdout = stdout or sys.stdout
        stderr = stderr or sys.stderr

        # Force UTF-8 encoding for stdout/stderr to handle emoji, Unicode, etc.
        if hasattr(stdout, 'reconfigure'):
            stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(stderr, 'reconfigure'):
            stderr.reconfigure(encoding='utf-8', errors='replace')

        # Register signal handlers
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        self.logger.info("%s started (pid=%d)", self.name, os.getpid())

        # Send ready signal
        ready = {"jsonrpc": "2.0", "method": "ready", "params": {"pid": os.getpid()}}
        stdout.write(json.dumps(ready) + "\n")
        stdout.flush()

        # Main read loop
        while self.running:
            try:
                line = stdin.readline()
                if not line:
                    break

                line = line.strip()
                if not line:
                    continue

                req = json.loads(line)
                resp = self._dispatch(req)
                stdout.write(json.dumps(resp) + "\n")
                stdout.flush()

            except json.JSONDecodeError as e:
                err = self.error(f"Invalid JSON: {e}")
                stdout.write(json.dumps(err) + "\n")
                stdout.flush()
            except Exception as e:
                self.logger.error("Error: %s\n%s", e, traceback.format_exc())
                err = self.error(str(e))
                stdout.write(json.dumps(err) + "\n")
                stdout.flush()

        self.logger.info("%s exited", self.name)

    # ── Internal ────────────────────────────────────────────────────────────

    def _dispatch(self, req: dict) -> dict:
        """Parse a JSON-RPC request and route it to the registered handler."""
        method = req.get("method", "")
        params = req.get("params", {})
        req_id = req.get("id")

        handler = self._handlers.get(method)
        if handler is None:
            return self.error(f"Unknown method: {method}", -32601, req_id)

        try:
            result = handler(params, req_id)
            return result
        except Exception as e:
            self.logger.error("Handler '%s' failed: %s\n%s", method, e, traceback.format_exc())
            return self.error(str(e), -32603, req_id)

    def _handle_signal(self, signum, frame):
        """Signal handler for SIGINT/SIGTERM — graceful shutdown."""
        self.logger.info("Received signal %s, shutting down...", signum)
        self.running = False

    def _handle_health(self, params: dict, req_id) -> dict:
        """Built-in health check handler."""
        return self.ok({"status": "healthy", "pid": os.getpid()}, req_id)

    def _handle_shutdown(self, params: dict, req_id) -> dict:
        """Built-in shutdown handler."""
        self.running = False
        return self.ok({"status": "shutting down"}, req_id)
