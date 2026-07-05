import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

import { getMcatStudyQueue } from "@/api/client";
import { useConnection } from "@/api/ConnectionContext";
import { ErrorBanner } from "@/components/ErrorBanner";
import { McqCard } from "@/components/McqCard";
import { TypedFlashcard } from "@/components/TypedFlashcard";
import type { McatStudyItem } from "@/gen/anki/scheduler_pb";
import { McatStudyItem_Kind } from "@/gen/anki/scheduler_pb";

export default function Study() {
    const { config, ready, unpair } = useConnection();
    const [items, setItems] = useState<McatStudyItem[] | null>(null);
    const [index, setIndex] = useState(0);
    const [answered, setAnswered] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!config) {
            return;
        }
        setError("");
        setItems(null);
        setIndex(0);
        setCorrectCount(0);
        setAnswered(false);
        try {
            const resp = await getMcatStudyQueue(config, { sessionSize: 0 });
            setItems(resp.items);
        } catch {
            setError("Couldn't load the study queue.");
        }
    }, [config]);

    useEffect(() => {
        load();
    }, [load]);

    if (!ready) {
        return null;
    }
    if (!config) {
        return <Redirect href="/pair" />;
    }

    const item = items?.[index];
    const done = items !== null && index >= items.length;

    function next(): void {
        setAnswered(false);
        setIndex((i) => i + 1);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {error !== "" && (
                <ErrorBanner
                    message={error}
                    onRetry={load}
                    onRepair={async () => {
                        await unpair();
                        router.replace("/pair");
                    }}
                />
            )}
            {items === null && error === "" && <Text>Loading queue…</Text>}
            {items !== null && items.length === 0 && (
                <Text>Nothing to study right now — come back later.</Text>
            )}
            {item && (
                <>
                    <Text style={styles.progress}>
                        {index + 1} / {items!.length}
                    </Text>
                    {item.kind === McatStudyItem_Kind.MCQ
                        ? (
                            <McqCard
                                key={item.cardId.toString()}
                                item={item}
                                config={config}
                                showFeedback
                                onAnswered={(correct) => {
                                    if (correct) {
                                        setCorrectCount((c) => c + 1);
                                    }
                                    setAnswered(true);
                                }}
                            />
                        )
                        : (
                            <TypedFlashcard
                                key={item.cardId.toString()}
                                item={item}
                                config={config}
                                onGraded={() => setAnswered(true)}
                            />
                        )}
                    {answered && <Button title="Next" onPress={next} />}
                </>
            )}
            {done && items!.length > 0 && (
                <View style={styles.summary}>
                    <Text style={styles.summaryHead}>Session complete</Text>
                    <Text>
                        {correctCount} MCQ{correctCount === 1 ? "" : "s"}{" "}
                        correct out of{" "}
                        {items!.filter((i) => i.kind === McatStudyItem_Kind.MCQ)
                            .length}
                    </Text>
                    <Button
                        title="Back to dashboard"
                        onPress={() => router.back()}
                    />
                    <Button title="New session" onPress={load} />
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 14 },
    progress: { color: "#888", fontWeight: "600" },
    summary: { gap: 10, alignItems: "flex-start" },
    summaryHead: { fontSize: 20, fontWeight: "800" },
});
