"""Start the real Rooms service with isolated data and development identities."""
import socket
import sys
import uvicorn
from rooms.config import DevUser, Settings
from rooms.server import build_server

sock = socket.socket()
sock.bind(("127.0.0.1", 0))
port = sock.getsockname()[1]
sock.listen(128)
settings = Settings(auth_mode="dev", base_url=f"http://127.0.0.1:{port}", db_path=sys.argv[1], cookie_secure=False, log_level="WARNING", dev_tokens={"rooms-proof-alice": DevUser("alice", "alice@example.test", "Alice"), "rooms-proof-bob": DevUser("bob", "bob@example.test", "Bob")})
mcp = build_server(settings)
class ProofServer(uvicorn.Server):
    async def startup(self, sockets=None):
        await super().startup(sockets)
        print(settings.base_url, flush=True)
ProofServer(uvicorn.Config(mcp.http_app(), log_level="warning", timeout_graceful_shutdown=1)).run(sockets=[sock])
