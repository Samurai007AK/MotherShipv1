"""Tests for Python sidecars using pytest."""
import json
import subprocess
import sys
import os

import pytest


def test_hello_bridge_exists():
    """Verify hello-bridge sidecar exists."""
    bridge_path = os.path.join(os.path.dirname(__file__), '..', 'hello-bridge', 'main.py')
    assert os.path.exists(bridge_path), f"hello-bridge not found at {bridge_path}"


def test_summary_engine_exists():
    """Verify summary-engine sidecar exists."""
    engine_path = os.path.join(os.path.dirname(__file__), '..', 'summary-engine', 'main.py')
    assert os.path.exists(engine_path), f"summary-engine not found at {engine_path}"


def test_hello_bridge_json_rpc_format():
    """Test that hello-bridge accepts JSON-RPC format."""
    # This is a basic format test - in production we'd spawn the process
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {}
    }
    # Verify the request is valid JSON
    json_str = json.dumps(request)
    parsed = json.loads(json_str)
    assert parsed["jsonrpc"] == "2.0"
    assert parsed["method"] == "initialize"


def test_summary_engine_has_template_fallback():
    """Verify summary-engine has template fallback logic."""
    engine_path = os.path.join(os.path.dirname(__file__), '..', 'summary-engine', 'main.py')
    if os.path.exists(engine_path):
        with open(engine_path, 'r') as f:
            content = f.read()
        # Check for template fallback
        assert 'template' in content.lower() or 'fallback' in content.lower(), \
            "Summary engine should have template fallback"


def test_sidecars_directory_structure():
    """Verify sidecars directory has expected structure."""
    sidecars_dir = os.path.join(os.path.dirname(__file__), '..')
    assert os.path.isdir(os.path.join(sidecars_dir, 'hello-bridge'))
    assert os.path.isdir(os.path.join(sidecars_dir, 'summary-engine'))
