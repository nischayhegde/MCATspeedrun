import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { ServerConfig } from "./pairing";
import {
    clearServerConfig,
    loadServerConfig,
    saveServerConfig,
} from "./storage";

interface Connection {
    config: ServerConfig | null;
    /** False until AsyncStorage has been read on boot. */
    ready: boolean;
    pair(config: ServerConfig): Promise<void>;
    unpair(): Promise<void>;
}

const ConnectionContext = createContext<Connection | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<ServerConfig | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        loadServerConfig()
            .then(setConfig)
            .finally(() => setReady(true));
    }, []);

    async function pair(next: ServerConfig): Promise<void> {
        await saveServerConfig(next);
        setConfig(next);
    }

    async function unpair(): Promise<void> {
        await clearServerConfig();
        setConfig(null);
    }

    return (
        <ConnectionContext.Provider value={{ config, ready, pair, unpair }}>
            {children}
        </ConnectionContext.Provider>
    );
}

export function useConnection(): Connection {
    const ctx = useContext(ConnectionContext);
    if (!ctx) {
        throw new Error("useConnection must be used inside ConnectionProvider");
    }
    return ctx;
}
