import { Stack } from "expo-router";

import { ConnectionProvider } from "@/api/ConnectionContext";

export default function RootLayout() {
    return (
        <ConnectionProvider>
            <Stack>
                <Stack.Screen name="index" options={{ title: "MCAT" }} />
                <Stack.Screen
                    name="pair"
                    options={{ title: "Pair with desktop" }}
                />
                <Stack.Screen name="study" options={{ title: "Study" }} />
                <Stack.Screen
                    name="diagnostic"
                    options={{ title: "Diagnostic" }}
                />
            </Stack>
        </ConnectionProvider>
    );
}
