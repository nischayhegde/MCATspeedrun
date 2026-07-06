import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ConnectionProvider } from "@/api/ConnectionContext";
import { Palette } from "@/constants/theme";

export default function RootLayout() {
    return (
        <ConnectionProvider>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: Palette.backgroundElement },
                    headerTintColor: Palette.text,
                    headerTitleStyle: {
                        color: Palette.text,
                        fontWeight: "800",
                    },
                    contentStyle: { backgroundColor: Palette.background },
                }}
            >
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
