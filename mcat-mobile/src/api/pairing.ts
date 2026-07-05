export interface ServerConfig {
    host: string;
    port: number;
    token: string;
}

/** Parse the QR / pasted pairing code produced by the desktop app. */
export function parsePairingPayload(raw: string): ServerConfig {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(
            "That doesn't look like a pairing code (invalid JSON).",
        );
    }
    const obj = data as Record<string, unknown>;
    if (obj?.v !== 1) {
        throw new Error("Unsupported pairing code version — update this app.");
    }
    const { host, port, token } = obj;
    if (typeof host !== "string" || host.length === 0) {
        throw new Error("Pairing code is missing the host address.");
    }
    if (
        typeof port !== "number"
        || !Number.isInteger(port)
        || port < 1
        || port > 65535
    ) {
        throw new Error("Pairing code has an invalid port.");
    }
    if (typeof token !== "string" || token.length === 0) {
        throw new Error("Pairing code is missing the token.");
    }
    return { host, port, token };
}

export function baseUrl(config: ServerConfig): string {
    return `http://${config.host}:${config.port}`;
}
