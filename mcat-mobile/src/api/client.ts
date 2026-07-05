import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type {
    DescMessage,
    MessageInitShape,
    MessageShape,
} from "@bufbuild/protobuf";
import { fetch } from "expo/fetch";

import { EmptySchema } from "../gen/anki/generic_pb";
import {
    AnswerMcatCardRequestSchema,
    AnswerMcatCardResponseSchema,
    AnswerMcatCardTypedRequestSchema,
    AnswerMcatCardTypedResponseSchema,
    McatDiagnosticRequestSchema,
    McatReadinessResponseSchema,
    McatStudyQueueRequestSchema,
    McatStudyQueueResponseSchema,
} from "../gen/anki/scheduler_pb";
import type { ServerConfig } from "./pairing";
import { baseUrl } from "./pairing";

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

const DEFAULT_TIMEOUT_MS = 15_000;
// LLM grading legitimately takes tens of seconds; don't kill it early.
const GRADING_TIMEOUT_MS = 90_000;

export async function callBackend(
    config: ServerConfig,
    method: string,
    body: Uint8Array,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Uint8Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(`${baseUrl(config)}/_anki/${method}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/binary",
                Authorization: `Bearer ${config.token}`,
            },
            // toBinary returns Uint8Array<ArrayBufferLike>; the DOM BodyInit
            // type (TS 6.x) requires an ArrayBuffer-backed view. toBinary
            // always allocates a fresh ArrayBuffer, so this cast is sound.
            body: body as Uint8Array<ArrayBuffer>,
            signal: controller.signal,
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => "request failed");
            throw new ApiError(resp.status, `${resp.status}: ${text}`);
        }
        return new Uint8Array(await resp.arrayBuffer());
    } finally {
        clearTimeout(timer);
    }
}

function rpc<I extends DescMessage, O extends DescMessage>(
    method: string,
    inSchema: I,
    outSchema: O,
    timeoutMs?: number,
) {
    return async (
        config: ServerConfig,
        init: MessageInitShape<I>,
    ): Promise<MessageShape<O>> => {
        const bytes = toBinary(inSchema, create(inSchema, init));
        const out = await callBackend(config, method, bytes, timeoutMs);
        return fromBinary(outSchema, out);
    };
}

export const computeMcatReadiness = rpc(
    "computeMcatReadiness",
    EmptySchema,
    McatReadinessResponseSchema,
);
export const recomputeMcatLeafStates = rpc(
    "recomputeMcatLeafStates",
    EmptySchema,
    McatReadinessResponseSchema,
);
export const getMcatStudyQueue = rpc(
    "getMcatStudyQueue",
    McatStudyQueueRequestSchema,
    McatStudyQueueResponseSchema,
);
export const answerMcatCard = rpc(
    "answerMcatCard",
    AnswerMcatCardRequestSchema,
    AnswerMcatCardResponseSchema,
);
export const answerMcatCardTyped = rpc(
    "answerMcatCardTyped",
    AnswerMcatCardTypedRequestSchema,
    AnswerMcatCardTypedResponseSchema,
    GRADING_TIMEOUT_MS,
);
export const getMcatDiagnostic = rpc(
    "getMcatDiagnostic",
    McatDiagnosticRequestSchema,
    McatStudyQueueResponseSchema,
);
export const resetMcatProgress = rpc(
    "resetMcatProgress",
    EmptySchema,
    McatReadinessResponseSchema,
);

/** URL for a media file (card image); served from the LAN server root. */
export function mediaUrl(config: ServerConfig, filename: string): string {
    return `${baseUrl(config)}/${encodeURIComponent(filename)}`;
}

export function mediaHeaders(config: ServerConfig): { Authorization: string } {
    return { Authorization: `Bearer ${config.token}` };
}
