import { useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { answerMcatCardTyped } from "@/api/client";
import type { ServerConfig } from "@/api/pairing";
import { SfButton } from "@/components/SfButton";
import { Palette } from "@/constants/theme";
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

    const verdictColor = gaveUp
        ? Palette.textSecondary
        : verdict === Verdict.CORRECT
        ? Palette.ok
        : verdict === Verdict.PARTIAL
        ? Palette.warn
        : Palette.err;

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
                        placeholderTextColor={Palette.steel}
                        editable={phase !== "error"}
                    />
                    {phase === "error" && (
                        <View style={styles.errorBox}>
                            <Text style={styles.error}>
                                Grading failed: {gradeError}
                            </Text>
                            <SfButton
                                title="Retry grading"
                                onPress={() => submit(gaveUp)}
                            />
                        </View>
                    )}
                    {phase === "prompt" && (
                        <View style={styles.row}>
                            <SfButton
                                title="Submit"
                                onPress={() => submit(false)}
                            />
                            <SfButton
                                title="I don't know"
                                variant="secondary"
                                onPress={() => submit(true)}
                            />
                        </View>
                    )}
                </>
            )}
            {phase === "grading" && (
                <View style={styles.grading}>
                    <ActivityIndicator color={Palette.red} />
                    <Text style={styles.gradingText}>Grading…</Text>
                </View>
            )}
            {phase === "graded" && (
                <View style={styles.feedbackBox}>
                    <Text style={[styles.verdict, { color: verdictColor }]}>
                        {verdictLabel}
                    </Text>
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
    card: {
        gap: 10,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Palette.border,
        backgroundColor: Palette.backgroundElement,
    },
    leaf: { fontSize: 12, color: Palette.textSecondary },
    front: {
        fontSize: 17,
        fontWeight: "600",
        lineHeight: 24,
        color: Palette.text,
    },
    input: {
        borderWidth: 1,
        borderColor: Palette.border,
        borderRadius: 10,
        padding: 12,
        minHeight: 90,
        textAlignVertical: "top",
        fontSize: 15,
        backgroundColor: Palette.backgroundElement,
        color: Palette.text,
    },
    row: { flexDirection: "row", gap: 12, justifyContent: "space-between" },
    grading: { flexDirection: "row", gap: 10, alignItems: "center" },
    gradingText: { color: Palette.textSecondary },
    errorBox: { gap: 8 },
    error: { color: Palette.err },
    feedbackBox: { gap: 8 },
    verdict: { fontWeight: "800", fontSize: 16 },
    llmNote: { fontStyle: "italic", color: Palette.textSecondary },
    back: { lineHeight: 21, color: Palette.text },
});
