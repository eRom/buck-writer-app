"""HTTP entrypoint for writing-tools-mcp.

Upstream (wdm0006/writing-tools-mcp) has BOTH:
  - /opt/wtm/server.py  : top-level script holding the FastMCP instance
  - /opt/wtm/server/    : sub-package with analyzers

A naive `from server import mcp` resolves to the package (which has no
`mcp` attribute), so we load `server.py` explicitly via importlib to
bypass the name collision. Loading via importlib also keeps `__name__`
different from `"__main__"`, so upstream's `if __name__ == "__main__":
mcp.run()` stdio guard does NOT fire.

Environment:
  HOST  — bind host (default 0.0.0.0)
  PORT  — bind port (default 7802)
"""

import importlib.util
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER_FILE = HERE / "server.py"

spec = importlib.util.spec_from_file_location("wtm_main", SERVER_FILE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load {SERVER_FILE}")
_wtm_main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_wtm_main)
mcp = _wtm_main.mcp  # the FastMCP instance


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "7802"))
    print(
        f"[writing-tools-mcp] starting streamable-http on {host}:{port}",
        flush=True,
    )
    mcp.run(transport="streamable-http", host=host, port=port)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
