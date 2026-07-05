import { useState } from "react";
import {
    ActivityIndicator,
    Button,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { answerMcatCardTyped } from "@/api/client";
import type { ServerConfig } from "@/api/pairing";
import type { McatStudyItem } from "@/gen/anki/scheduler_pb";
import { AnswerMcatCardTypedResponse_Verdict as Verdict } from "@/gen/anki/scheduler_pb";

type Phase = "prompt" | "grading" | "graded" | "error";

export function TypedFlashcard({
    item,
    config,
    onGraded,
}: {
    item: McatStudyItem;
    config: ServerConfig;
    onGraded: (verdict: Verdict) => void;
}) {
    const [phase, setPhase] = useState<Phase>("prompt");
    const [typed, setTyped] = useState("");
    const [verdict, setVerdict] = useState<Verdict>(Verdict.INCORRECT);
    const [feedback, setFeedback] = useState("");
    const [gaveUp, setGaveUp] = useState(false);
    const [gradeError, setGradeError] = useState("");
    const [startedAt] = useState(() => Date.now());
    const [submittedMs, setSubmittedMs] = useState(0);

    // Blocks until a verdict arrives; on failure the card stays unanswered and
    // the same submission can be retried (no self-grade fallback).
    async function submit(giveUp: boolean): Promise<void> {
        if (phase === "grading" || phase === "graded") {
            return;
        }
        const ms = phase === "prompt"
            ? Math.min(Date.now() - startedAt, 10 * 60 * 1000)
            : submittedMs; // retries reuse the first-submit latency
        setSubmittedMs(ms);
        const didGiveUp = giveUp || typed.trim().length === 0;
        setGaveUp(didGiveUp);
        setPhase("grading");
        setGradeError("");
        try {
            const resp = await answerMcatCardTyped(config, {
                cardId: item.cardId,
                typedAnswer: typed,
                millisecondsTaken: ms,
                gaveUp: didGiveUp,
            });
            setVerdict(resp.verdict);
            setFeedback(resp.feedback);
            setPhase("graded");
            onGraded(resp.verdict);
        } catch (err) {
            setPhase("error");
            setGradeError(err instanceof Error ? err.message : String(err));
        }
    }

    const verdictLabel = gaveUp
        ? "Didn't know — marked Again"
        : verdict === Verdict.CORRECT
        ? "Correct"
        : verdict === Verdict.PARTIAL
        ? "Partially correct"
        : "Incorrect";

    return (
        <View style={styles.card}>
            <Text style={styles.leaf}>
                {item.leafId} · {item.leafName}
            </Text>
            <Text style={styles.front}>{item.front}</Text>
            {(phase === "prompt" || phase === "error") && (
                <>
                    <TextInput
                        style={styles.input}
                        multiline
                        value={typed}
                        onChangeText={setTyped}
                        placeholder="Describe it from memory…"
                        editable={phase !== "error"}
                    />
                    {phase === "error" && (
                        <View style={styles.errorBox}>
                            <Text style={styles.error}>
                                Grading failed: {gradeError}
                            </Text>
                            <Button
                                title="Retry grading"
                                onPress={() => submit(gaveUp)}
                            />
                        </View>
                    )}
                    {phase === "prompt" && (
                        <View style={styles.row}>
                            <Button
                                title="Submit"
                                onPress={() => submit(false)}
                            />
                            <Button
                                title="I don't know"
                                onPress={() => submit(true)}
                            />
                        </View>
                    )}
                </>
            )}
            {phase === "grading" && (
                <View style={styles.grading}>
                    <ActivityIndicator />
                    <Text style={styles.gradingText}>Grading…</Text>
                </View>
            )}
            {phase === "graded" && (
                <View style={styles.feedbackBox}>
                    <Text style={styles.verdict}>{verdictLabel}</Text>
                    {feedback !== "" && (
                        <Text style={styles.llmNote}>{feedback}</Text>
                    )}
                    <Text style={styles.back}>{item.back}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { gap: 10 },
    leaf: { fontSize: 12, color: "#888" },
    front: { fontSize: 17, fontWeight: "600", lineHeight: 24 },
    input: {
        borderWidth: 1,
        borderColor: "#8886",
        borderRadius: 10,
        padding: 12,
        minHeight: 90,
        textAlignVertical: "top",
        fontSize: 15,
    },
    row: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
    grading: { flexDirection: "row", gap: 10, alignItems: "center" },
    gradingText: { color: "#777" },
    errorBox: { gap: 8 },
    error: { color: "#c0392b" },
    feedbackBox: { gap: 8 },
    verdict: { fontWeight: "800", fontSize: 16 },
    llmNote: { fontStyle: "italic", color: "#555" },
    back: { lineHeight: 21 },
});
