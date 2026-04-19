"""HTTP entrypoint for writing-tools-mcp.

Upstream (wdm0006/writing-tools-mcp) exposes only the stdio transport via
`server.py`. FastMCP supports `streamable-http` natively — we just import the
configured `mcp` instance from the upstream module and re-run it with the HTTP
transport bound to 0.0.0.0:7802.

Environment:
  HOST  — bind host (default 0.0.0.0)
  PORT  — bind port (default 7802)
"""

import os
import sys

# The upstream package exposes the FastMCP instance as `mcp` inside server.py.
# server.py uses `mcp.run()` under `if __name__ == "__main__"` which we skip.
from server import mcp  # type: ignore[import-not-found]


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "7802"))
    print(f"[writing-tools-mcp] starting streamable-http on {host}:{port}", flush=True)
    mcp.run(transport="streamable-http", host=host, port=port)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
