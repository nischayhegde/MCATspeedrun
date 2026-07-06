import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    ApiError,
    computeMcatReadiness,
    recomputeMcatLeafStates,
} from "@/api/client";
import { useConnection } from "@/api/ConnectionContext";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MeterBar } from "@/components/MeterBar";
import { SfButton } from "@/components/SfButton";
import { Palette } from "@/constants/theme";
import type {
    McatLeafState,
    McatReadinessResponse,
} from "@/gen/anki/scheduler_pb";

interface Section {
    label: string;
    leaves: McatLeafState[];
}

function groupBySection(leaves: McatLeafState[]): Section[] {
    const order: string[] = [];
    const map = new Map<string, McatLeafState[]>();
    for (const leaf of leaves) {
        if (!map.has(leaf.section)) {
            map.set(leaf.section, []);
            order.push(leaf.section);
        }
        map.get(leaf.section)!.push(leaf);
    }
    return order.map((label) => ({ label, leaves: map.get(label)! }));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Dashboard() {
    const { config, ready, unpair } = useConnection();
    const [readiness, setReadiness] = useState<McatReadinessResponse | null>(
        null,
    );
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(
        async (recompute: boolean) => {
            if (!config) {
                return;
            }
            setError("");
            try {
                const resp = recompute
                    ? await recomputeMcatLeafStates(config, {})
                    : await computeMcatReadiness(config, {});
                setReadiness(resp);
            } catch (err) {
                setError(
                    err instanceof ApiError
                        && (err.status === 401 || err.status === 403)
                        ? "The desktop rejected this phone's pairing."
                        : "Couldn't reach the desktop.",
                );
            }
        },
        [config],
    );

    useFocusEffect(
        useCallback(() => {
            load(false);
        }, [load]),
    );

    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }

    return (
        <ScrollView
            contentContainerStyle={styles.container}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    tintColor={Palette.red}
                    colors={[Palette.red]}
                    onRefresh={async () => {
                        setRefreshing(true);
                        await load(true);
                        setRefreshing(false);
                    }}
                />
            }
        >
            {error !== "" && (
                <ErrorBanner
                    message={error}
                    onRetry={() => load(false)}
                    onRepair={async () => {
                        await unpair();
                        router.replace("/pair");
                    }}
                />
            )}
            {readiness && (
                <>
                    <View style={styles.scoreCard}>
                        <Text style={styles.score}>
                            {readiness.readinessScore}
                            <Text style={styles.scale}>/ 528</Text>
                        </Text>
                        <Text style={styles.meta}>
                            {Math.round(readiness.readinessPct)}% blueprint
                            mastery · ±{readiness.confidenceBand} pts ·{" "}
                            {Math.round(readiness.confidencePct)}% confidence
                        </Text>
                        <View style={styles.metricRow}>
                            <Text style={styles.metricLabel}>coverage</Text>
                            <MeterBar value={readiness.coverage} />
                            <Text style={styles.metricVal}>
                                {pct(readiness.coverage)}
                            </Text>
                        </View>
                        <View style={styles.metricRow}>
                            <Text style={styles.metricLabel}>depth</Text>
                            <MeterBar value={readiness.depth} />
                            <Text style={styles.metricVal}>
                                {pct(readiness.depth)}
                            </Text>
                        </View>
                        <View style={styles.metricRow}>
                            <Text style={styles.metricLabel}>freshness</Text>
                            <MeterBar value={readiness.freshness} />
                            <Text style={styles.metricVal}>
                                {pct(readiness.freshness)}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.actions}>
                        <SfButton
                            title="Study now"
                            onPress={() => router.push("/study")}
                        />
                        <SfButton
                            title="Take diagnostic"
                            variant="secondary"
                            onPress={() => router.push("/diagnostic")}
                        />
                    </View>
                    {groupBySection(readiness.leaves).map((section) => (
                        <View key={section.label} style={styles.section}>
                            <Text style={styles.sectionLabel}>
                                {section.label}
                            </Text>
                            {section.leaves.map((leaf) => (
                                <View
                                    key={leaf.leafId}
                                    style={[
                                        styles.leaf,
                                        !leaf.assessed && styles.unassessed,
                                    ]}
                                >
                                    <Text
                                        style={styles.leafName}
                                        numberOfLines={2}
                                    >
                                        {leaf.name}
                                    </Text>
                                    {!leaf.isCars && (
                                        <View style={styles.metricRow}>
                                            <Text style={styles.metricLabel}>
                                                fluency
                                            </Text>
                                            <MeterBar value={leaf.fluency} />
                                            <Text style={styles.metricVal}>
                                                {pct(leaf.fluency)}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.metricRow}>
                                        <Text style={styles.metricLabel}>
                                            application
                                        </Text>
                                        <MeterBar value={leaf.application} />
                                        <Text style={styles.metricVal}>
                                            {pct(leaf.application)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 16 },
    scoreCard: {
        padding: 16,
        borderRadius: 14,
        backgroundColor: Palette.backgroundElement,
        borderWidth: 1,
        borderColor: Palette.border,
        gap: 6,
    },
    score: { fontSize: 52, fontWeight: "900", color: Palette.text },
    scale: { fontSize: 18, fontWeight: "400", color: Palette.textSecondary },
    meta: { color: Palette.textSecondary },
    actions: { gap: 8 },
    section: { gap: 8 },
    sectionLabel: {
        fontSize: 13,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 1,
        color: Palette.textSecondary,
    },
    leaf: {
        padding: 10,
        borderRadius: 10,
        backgroundColor: Palette.backgroundElement,
        borderWidth: 1,
        borderColor: Palette.border,
        gap: 4,
    },
    unassessed: { opacity: 0.5 },
    leafName: { fontWeight: "600", color: Palette.text },
    metricRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    metricLabel: { width: 78, fontSize: 12, color: Palette.textSecondary },
    metricVal: {
        width: 42,
        textAlign: "right",
        fontSize: 12,
        color: Palette.textSecondary,
    },
});
