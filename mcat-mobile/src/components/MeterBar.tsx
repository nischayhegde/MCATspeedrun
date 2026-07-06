import { StyleSheet, View } from "react-native";

import { Palette } from "@/constants/theme";

export function MeterBar({ value }: { value: number }) {
    const pct = Math.max(0, Math.min(1, value)) * 100;
    return (
        <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#ffffff1f",
        overflow: "hidden",
    },
    fill: { height: "100%", borderRadius: 4, backgroundColor: Palette.gold },
});
