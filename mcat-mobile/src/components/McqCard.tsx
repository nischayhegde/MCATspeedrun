import { useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { answerMcatCard, mediaHeaders, mediaUrl } from "@/api/client";
import type { ServerConfig } from "@/api/pairing";
import type { McatStudyItem } from "@/gen/anki/scheduler_pb";

const LETTERS = ["A", "B", "C", "D"];

export function McqCard({
    item,
    config,
    showFeedback,
    onAnswered,
}: {
    item: McatStudyItem;
    config: ServerConfig;
    /** false during diagnostics (exam mode) */
    showFeedback: boolean;
    onAnswered: (correct: boolean) => void;
}) {
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [startedAt] = useState(() => Date.now());
    // Frozen on the first attempt so a failed-then-retried submit doesn't
    // inflate millisecondsTaken — the MCQ FSRS grade is derived from it.
    const submittedMsRef = useRef<number | null>(null);
    const lettersOnly = item.image !== "";

    async function choose(letter: string, idk: boolean): Promise<void> {
        if (chosen !== null || busy) {
            return;
        }
        setBusy(true);
        setError("");
        const correct = !idk && letter === item.answer;
        const ms =
            submittedMsRef.current ??
            Math.min(Date.now() - startedAt, 10 * 60 * 1000);
        submittedMsRef.current = ms;
        try {
            await answerMcatCard(config, {
                cardId: item.cardId,
                correct,
                millisecondsTaken: ms,
                selfRating: 0,
            });
            setChosen(idk ? "__idk__" : letter);
            onAnswered(correct);
        } catch {
            setError(
                "Couldn't submit the answer — check the connection and tap a choice again.",
            );
        } finally {
            setBusy(false);
        }
    }

    const answered = chosen !== null;
    const wasCorrect = chosen === item.answer;

    return (
        <View style={styles.card}>
            <Text style={styles.leaf}>
                {item.leafId} · {item.leafName}
            </Text>
            {item.front !== "" && <Text style={styles.stem}>{item.front}</Text>}
            {item.image !== "" && (
                <Image
                    style={styles.image}
                    resizeMode="contain"
                    source={{
                        uri: mediaUrl(config, item.image),
                        headers: mediaHeaders(config),
                    }}
                />
            )}
            {item.choices.map((choice, i) => {
                const letter = LETTERS[i] ?? String(i + 1);
                const isAnswer = letter === item.answer;
                const isChosen = letter === chosen;
                return (
                    <TouchableOpacity
                        key={letter}
                        disabled={answered || busy}
                        style={[
                            styles.choice,
                            answered && showFeedback && isAnswer
                            && styles.correctChoice,
                            answered && showFeedback && isChosen && !isAnswer
                            && styles.wrongChoice,
                        ]}
                        onPress={() => choose(letter, false)}
                    >
                        <Text style={styles.choiceText}>
                            {letter}
                            {lettersOnly ? "" : `. ${choice}`}
                        </Text>
                    </TouchableOpacity>
                );
            })}
            {!answered && (
                <TouchableOpacity
                    disabled={busy}
                    style={[styles.choice, styles.idk]}
                    onPress={() => choose("", true)}
                >
                    <Text style={styles.choiceText}>I don't know</Text>
                </TouchableOpacity>
            )}
            {error !== "" && <Text style={styles.error}>{error}</Text>}
            {answered && showFeedback && (
                <View style={styles.feedback}>
                    <Text style={styles.verdict}>
                        {chosen === "__idk__"
                            ? `Didn't know — answer: ${item.answer}`
                            : wasCorrect
                            ? "Correct"
                            : `Incorrect — answer: ${item.answer}`}
                    </Text>
                    {item.explanation !== "" && (
                        <Text style={styles.explanation}>
                            {item.explanation}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { gap: 10 },
    leaf: { fontSize: 12, color: "#888" },
    stem: { fontSize: 16, lineHeight: 23 },
    image: {
        width: "100%",
        height: 260,
        borderRadius: 8,
        backgroundColor: "#fff",
    },
    choice: {
        borderWidth: 1,
        borderColor: "#8886",
        borderRadius: 10,
        padding: 12,
    },
    idk: { borderStyle: "dashed", opacity: 0.8 },
    correctChoice: { borderColor: "#2e7d32", backgroundColor: "#2e7d3222" },
    wrongChoice: { borderColor: "#c62828", backgroundColor: "#c6282822" },
    choiceText: { fontSize: 15 },
    error: { color: "#c0392b" },
    feedback: { gap: 6, marginTop: 4 },
    verdict: { fontWeight: "800" },
    explanation: { color: "#555", lineHeight: 20 },
});
