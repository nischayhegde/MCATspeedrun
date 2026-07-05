import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

import {
    computeMcatReadiness,
    getMcatDiagnostic,
    recomputeMcatLeafStates,
} from "@/api/client";
import { useConnection } from "@/api/ConnectionContext";
import { ErrorBanner } from "@/components/ErrorBanner";
import { McqCard } from "@/components/McqCard";
import type {
    McatReadinessResponse,
    McatStudyItem,
} from "@/gen/anki/scheduler_pb";

type Phase = "intro" | "exam" | "submitting" | "results";

const COUNT_CHOICES = [
    { label: "Quick (20)", count: 20 },
    { label: "Half (60)", count: 60 },
    { label: "Full (120)", count: 0 }, // 0 = backend default of 120
];

export default function Diagnostic() {
    const { config, ready, unpair } = useConnection();
    const [phase, setPhase] = useState<Phase>("intro");
    const [items, setItems] = useState<McatStudyItem[]>([]);
    const [index, setIndex] = useState(0);
    const [answered, setAnswered] = useState(false);
    const [tallies, setTallies] = useState(
        new Map<string, { correct: number; total: number }>(),
    );
    const [before, setBefore] = useState<McatReadinessResponse | null>(null);
    const [after, setAfter] = useState<McatReadinessResponse | null>(null);
    const [error, setError] = useState("");

    async function begin(count: number): Promise<void> {
        if (!config) {
            return;
        }
        setError("");
        try {
            const [diag, snapshot] = await Promise.all([
                getMcatDiagnostic(config, { questionCount: count, seed: 0n }),
                computeMcatReadiness(config, {}),
            ]);
            if (diag.items.length === 0) {
                setError(
                    "No MCAT questions found — import content on the desktop first.",
                );
                return;
            }
            setBefore(snapshot);
            setItems(diag.items);
            setIndex(0);
            setAnswered(false);
            setTallies(new Map());
            setPhase("exam");
        } catch {
            setError("Couldn't start the diagnostic.");
        }
    }

    function recordAnswer(item: McatStudyItem, correct: boolean): void {
        setTallies((prev) => {
            const nextMap = new Map(prev);
            const t = nextMap.get(item.section) ?? { correct: 0, total: 0 };
            nextMap.set(item.section, {
                correct: t.correct + (correct ? 1 : 0),
                total: t.total + 1,
            });
            return nextMap;
        });
        setAnswered(true);
    }

    async function next(): Promise<void> {
        if (index + 1 < items.length) {
            setAnswered(false);
            setIndex(index + 1);
            return;
        }
        setPhase("submitting");
        setError("");
        try {
            setAfter(await recomputeMcatLeafStates(config!, {}));
            setPhase("results");
        } catch {
            setError(
                "Couldn't compute results — check the connection and try again.",
            );
            // Stay in "submitting" (NOT "exam"): reverting to the exam phase
            // remounts the already-answered last card as answerable, so a tap
            // would submit a duplicate grade + inflate the tally. The error
            // banner's Retry re-runs next() to re-attempt scoring.
        }
    }

    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }

    const item = items[index];
    const totals = [...tallies.values()].reduce(
        (acc, t) => ({
            correct: acc.correct + t.correct,
            total: acc.total + t.total,
        }),
        { correct: 0, total: 0 },
    );

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {error !== "" && (
                <ErrorBanner
                    message={error}
                    onRetry={phase === "intro" ? undefined : next}
                    onRepair={async () => {
                        await unpair();
                        router.replace("/pair");
                    }}
                />
            )}
            {phase === "intro" && (
                <View style={styles.intro}>
                    <Text style={styles.head}>Diagnostic exam</Text>
                    <Text style={styles.body}>
                        Blueprint-stratified MCQs across all sections. No
                        feedback until the end — it calibrates your readiness
                        score.
                    </Text>
                    {COUNT_CHOICES.map((c) => (
                        <Button
                            key={c.label}
                            title={c.label}
                            onPress={() => begin(c.count)}
                        />
                    ))}
                </View>
            )}
            {phase === "exam" && item && (
                <>
                    <Text style={styles.progress}>
                        {index + 1} / {items.length}
                    </Text>
                    <McqCard
                        key={item.cardId.toString()}
                        item={item}
                        config={config}
                        showFeedback={false}
                        onAnswered={(correct) => recordAnswer(item, correct)}
                    />
                    {answered && (
                        <Button
                            title={index + 1 < items.length ? "Next" : "Finish"}
                            onPress={next}
                        />
                    )}
                </>
            )}
            {phase === "submitting" && error === "" && <Text>Scoring…</Text>}
            {phase === "results" && after && (
                <View style={styles.results}>
                    <Text style={styles.head}>Results</Text>
                    <Text style={styles.bigline}>
                        {totals.correct} / {totals.total} correct
                    </Text>
                    {[...tallies.entries()].map(([section, t]) => (
                        <Text key={section} style={styles.body}>
                            {section}: {t.correct} / {t.total}
                        </Text>
                    ))}
                    {before && (
                        <Text style={styles.delta}>
                            Readiness: {before.readinessScore} →{" "}
                            {after.readinessScore} / 528
                        </Text>
                    )}
                    <Button
                        title="Back to dashboard"
                        onPress={() => router.back()}
                    />
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 14 },
    intro: { gap: 12 },
    head: { fontSize: 22, fontWeight: "800" },
    body: { lineHeight: 21 },
    progress: { color: "#888", fontWeight: "600" },
    results: { gap: 10, alignItems: "flex-start" },
    bigline: { fontSize: 28, fontWeight: "900" },
    delta: { fontWeight: "700", marginTop: 6 },
});
