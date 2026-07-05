import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ServerConfig } from "./pairing";
import { parsePairingPayload } from "./pairing";

const KEY = "mcat.serverConfig";

export async function loadServerConfig(): Promise<ServerConfig | null> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
        return null;
    }
    try {
        const { host, port, token } = JSON.parse(raw);
        return parsePairingPayload(JSON.stringify({ v: 1, host, port, token }));
    } catch {
        return null; // corrupt storage: treat as unpaired
    }
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(config));
}

export async function clearServerConfig(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
}
