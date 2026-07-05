import { baseUrl, parsePairingPayload } from "../src/api/pairing";

const VALID = JSON.stringify({
    v: 1,
    host: "192.168.1.23",
    port: 8045,
    token: "abc123",
});

describe("parsePairingPayload", () => {
    it("parses a valid payload", () => {
        expect(parsePairingPayload(VALID)).toEqual({
            host: "192.168.1.23",
            port: 8045,
            token: "abc123",
        });
    });

    it("rejects non-JSON", () => {
        expect(() => parsePairingPayload("not json")).toThrow(/pairing code/i);
    });

    it("rejects wrong version", () => {
        expect(() =>
            parsePairingPayload(
                JSON.stringify({ v: 2, host: "h", port: 1, token: "t" }),
            )
        ).toThrow(/version/i);
    });

    it.each([
        ["host", { v: 1, port: 8045, token: "t" }],
        ["port", { v: 1, host: "h", token: "t" }],
        ["token", { v: 1, host: "h", port: 8045 }],
    ])("rejects missing %s", (_field, payload) => {
        expect(() => parsePairingPayload(JSON.stringify(payload))).toThrow();
    });

    it("rejects out-of-range port", () => {
        expect(() =>
            parsePairingPayload(
                JSON.stringify({ v: 1, host: "h", port: 70000, token: "t" }),
            )
        ).toThrow();
    });
});

describe("baseUrl", () => {
    it("builds an http URL", () => {
        expect(baseUrl({ host: "192.168.1.23", port: 8045, token: "x" })).toBe(
            "http://192.168.1.23:8045",
        );
    });
});
