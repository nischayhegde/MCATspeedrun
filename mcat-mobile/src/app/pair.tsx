import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Button,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { computeMcatReadiness } from "@/api/client";
import { useConnection } from "@/api/ConnectionContext";
import { parsePairingPayload } from "@/api/pairing";

export default function Pair() {
    const { pair } = useConnection();
    const [permission, requestPermission] = useCameraPermissions();
    const [pasted, setPasted] = useState("");
    const [error, setError] = useState("");
    const [verifying, setVerifying] = useState(false);

    async function connect(raw: string): Promise<void> {
        if (verifying) {
            return;
        }
        setError("");
        setVerifying(true);
        try {
            const config = parsePairingPayload(raw);
            // one cheap RPC round-trip proves host/port/token all work
            await computeMcatReadiness(config, {});
            await pair(config);
            router.replace("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setVerifying(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.heading}>
                On the desktop, open the MCAT dashboard and press “Phone
                access”, then scan the QR code.
            </Text>
            {permission?.granted
                ? (
                    <CameraView
                        style={styles.camera}
                        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                        onBarcodeScanned={({ data }) => connect(data)}
                    />
                )
                : (
                    <Button
                        title="Allow camera to scan the QR code"
                        onPress={requestPermission}
                    />
                )}
            <Text style={styles.or}>…or paste the pairing code:</Text>
            <TextInput
                style={styles.input}
                value={pasted}
                onChangeText={setPasted}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder='{"v":1,"host":"192.168.…","port":8045,"token":"…"}'
                multiline
            />
            <Button
                title="Connect"
                disabled={verifying || pasted.trim().length === 0}
                onPress={() => connect(pasted.trim())}
            />
            {verifying && <ActivityIndicator style={styles.spinner} />}
            {error !== "" && <Text style={styles.error}>{error}</Text>}
            <Text style={styles.hint}>
                iOS may ask for Local Network access on first connect — allow
                it. The phone must be on the same Wi-Fi as the desktop.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 12 },
    heading: { fontSize: 15, lineHeight: 21 },
    camera: { height: 280, borderRadius: 12, overflow: "hidden" },
    or: { marginTop: 8, fontWeight: "600" },
    input: {
        borderWidth: 1,
        borderColor: "#999",
        borderRadius: 8,
        padding: 10,
        minHeight: 64,
        fontFamily: "monospace",
        fontSize: 12,
    },
    spinner: { marginTop: 8 },
    error: { color: "#c0392b", fontWeight: "600" },
    hint: { color: "#777", fontSize: 12, marginTop: 8 },
});
