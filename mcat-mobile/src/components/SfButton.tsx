import { Pressable, StyleSheet, Text } from "react-native";

import { Palette } from "@/constants/theme";

/**
 * Fight Night buttons, ported from the desktop's button-primary /
 * button-secondary mixins (ts/routes/mcat/lib/mixins.scss). Primary is the
 * brand-red "strike" button; secondary is the steel-outlined quiet action.
 */
export function SfButton({
    title,
    onPress,
    variant = "primary",
    disabled = false,
}: {
    title: string;
    onPress: () => void;
    variant?: "primary" | "secondary";
    disabled?: boolean;
}) {
    const primary = variant === "primary";
    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.base,
                primary ? styles.primary : styles.secondary,
                pressed && (primary
                    ? styles.primaryPressed
                    : styles.secondaryPressed),
                disabled && styles.disabled,
            ]}
        >
            <Text style={[styles.label, !primary && styles.labelSecondary]}>
                {title}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 22,
        alignItems: "center",
    },
    primary: {
        backgroundColor: Palette.red,
        shadowColor: Palette.red,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
        elevation: 4,
    },
    primaryPressed: { backgroundColor: Palette.redDeep },
    secondary: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: Palette.steel,
        paddingVertical: 9,
    },
    secondaryPressed: { backgroundColor: "#56607324" },
    disabled: { opacity: 0.4 },
    label: {
        color: "#ffffff",
        fontWeight: "800",
        fontSize: 15,
    },
    labelSecondary: {
        color: Palette.text,
        fontWeight: "700",
    },
});
