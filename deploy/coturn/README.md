# Tuga TURN with coturn

Tuga requests ICE configuration through the JWT-protected `/api/rtc-config` route. The application server creates one-hour coturn REST credentials for the signed-in user; the shared secret remains on the server. This follows coturn's `use-auth-secret` / `static-auth-secret` mechanism.

1. Deploy coturn on a public host with a DNS name such as `turn.example.com` and a valid TLS certificate for that name.
2. Copy `turnserver.conf.example` to `turnserver.conf`. Replace the placeholder secret with a cryptographically random value. Keep the same secret in the Tuga server environment as `TUGA_TURN_SECRET`.
3. Set `TUGA_TURN_URLS` to the reachable `turn:` and `turns:` addresses and set `TUGA_STUN_URLS` to your STUN endpoint. Set a separate long random `TUGA_JWT_SECRET` in production. Restart Tuga after setting the variables.
4. Allow TCP/UDP 3478, TCP 5349 for TLS, and UDP 49160–49200 in the host firewall and cloud firewall. If coturn is behind NAT, configure its public/private address mapping with `external-ip`.
5. Sign into Tuga, open a call, and verify connectivity on networks that block direct peer connections. A TURN service relays media and consumes bandwidth, so monitor its relay traffic and quotas.

Coturn's example configuration documents the shared-secret options. `RTCPeerConnection` receives the resulting ICE server list in its configuration before negotiation starts. [coturn configuration](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf), [MDN RTCPeerConnection configuration](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection).

Without the environment values, Tuga uses its existing STUN fallback and marks TURN as unconfigured. This repository does not contain a public TURN hostname, TLS certificate, or deployment secret, so the TURN relay must be started on your server and configured with those values.

