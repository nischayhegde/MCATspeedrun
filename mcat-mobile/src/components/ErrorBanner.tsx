import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function ErrorBanner({
    message,
    onRetry,
    onRepair,
}: {
    message: string;
    onRetry?: () => void;
    onRepair?: () => void;
}) {
    return (
        <View style={styles.banner}>
            <Text style={styles.text}>{message}</Text>
            <Text style={styles.hint}>
                Is the desktop's Phone access server running, and is this phone
                on the same Wi-Fi (not cellular)?
            </Text>
            <View style={styles.row}>
                {onRetry && (
                    <TouchableOpacity style={styles.btn} onPress={onRetry}>
                        <Text style={styles.btnText}>Retry</Text>
                    </TouchableOpacity>
                )}
                {onRepair && (
                    <TouchableOpacity style={styles.btn} onPress={onRepair}>
                        <Text style={styles.btnText}>Re-pair</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        backgroundColor: "#7a1f1f",
        padding: 12,
        borderRadius: 10,
        margin: 12,
    },
    text: { color: "#fff", fontWeight: "600" },
    hint: { color: "#ffffffbb", fontSize: 12, marginTop: 4 },
    row: { flexDirection: "row", gap: 12, marginTop: 8 },
    btn: {
        backgroundColor: "#ffffff22",
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
    },
    btnText: { color: "#fff", fontWeight: "700" },
});
