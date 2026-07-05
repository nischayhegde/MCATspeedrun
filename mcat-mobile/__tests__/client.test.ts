import { create, toBinary } from "@bufbuild/protobuf";

import { McatReadinessResponseSchema } from "../src/gen/anki/scheduler_pb";

const mockFetch = jest.fn();
jest.mock(
    "expo/fetch",
    () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }),
);

import { ApiError, computeMcatReadiness, mediaUrl } from "../src/api/client";

const CONFIG = { host: "192.168.1.23", port: 8045, token: "tok" };

function okResponse(bytes: Uint8Array) {
    return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
            bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
            ),
        text: async () => "",
    };
}

describe("computeMcatReadiness", () => {
    beforeEach(() => mockFetch.mockReset());

    it("POSTs binary protobuf with auth header and parses the response", async () => {
        const fixture = create(McatReadinessResponseSchema, {
            readinessScore: 501,
            readinessPct: 55,
        });
        mockFetch.mockResolvedValue(
            okResponse(toBinary(McatReadinessResponseSchema, fixture)),
        );

        const resp = await computeMcatReadiness(CONFIG, {});

        expect(resp.readinessScore).toBe(501);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe("http://192.168.1.23:8045/_anki/computeMcatReadiness");
        expect(init.method).toBe("POST");
        expect(init.headers["Content-Type"]).toBe("application/binary");
        expect(init.headers.Authorization).toBe("Bearer tok");
        expect(init.body).toBeInstanceOf(Uint8Array);
        expect(init.signal).toBeDefined();
    });

    it("throws ApiError with status on non-200", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => "forbidden",
            arrayBuffer: async () => new ArrayBuffer(0),
        });
        await expect(computeMcatReadiness(CONFIG, {})).rejects.toMatchObject({
            status: 403,
        });
        await expect(
            computeMcatReadiness(CONFIG, {}),
        ).rejects.toBeInstanceOf(ApiError);
    });
});

describe("mediaUrl", () => {
    it("builds a root-path URL", () => {
        expect(mediaUrl(CONFIG, "img.jpg")).toBe(
            "http://192.168.1.23:8045/img.jpg",
        );
    });
});
