import type { Compression } from "./compression.js";
/**
 * Represents an Enveloped-Message of the Connect protocol.
 * https://connectrpc.com/docs/protocol#streaming-rpcs
 *
 * @private Internal code, does not follow semantic versioning.
 */
export interface EnvelopedMessage {
    /**
     * Envelope-Flags, a set of 8 bitwise flags.
     */
    flags: number;
    /**
     * Raw data of the message that was enveloped.
     */
    data: Uint8Array;
}
/**
 * Decodes chunks of raw bytes into enveloped messages.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export type EnvelopeDecoder = {
    /**
     * Decode enveloped messages.
     *
     * If the chunk is incomplete, buffer for subsequent calls.
     *
     * If a message exceeds `readMaxBytes`, raise an error. The decoder must be
     * discarded.
     */
    decode(chunk: Uint8Array): EnvelopedMessage[];
    /**
     * Size of the buffer. Use this property to check for incomplete data.
     */
    readonly byteLength: number;
    /**
     * Maximum size for individual messages.
     */
    readonly readMaxBytes: number;
};
/**
 * Create an EnvelopeDecoder. The `readMaxBytes` argument limits the maximum
 * size for individual messages.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function createEnvelopeDecoder(readMaxBytes: number): EnvelopeDecoder;
/**
 * Create a WHATWG ReadableStream of enveloped messages from a ReadableStream
 * of bytes.
 *
 * Ideally, this would simply be a TransformStream, but ReadableStream.pipeThrough
 * does not have the necessary availability at this time.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function createEnvelopeReadableStream(stream: ReadableStream<Uint8Array>): ReadableStream<EnvelopedMessage>;
/**
 * Compress an EnvelopedMessage.
 *
 * Raises Internal if an enveloped message is already compressed.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function envelopeCompress(envelope: EnvelopedMessage, compression: Compression | null, compressMinBytes: number): Promise<EnvelopedMessage>;
/**
 * Decompress an EnvelopedMessage.
 *
 * Raises InvalidArgument if an envelope is compressed, but compression is null.
 *
 * Relies on the provided Compression to raise ResourceExhausted if the
 * *decompressed* message size is larger than readMaxBytes. If the envelope is
 * not compressed, readMaxBytes is not honored.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function envelopeDecompress(envelope: EnvelopedMessage, compression: Compression | null, readMaxBytes: number): Promise<EnvelopedMessage>;
/**
 * Encode a single enveloped message.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function encodeEnvelope(flags: number, data: Uint8Array): Uint8Array<ArrayBuffer>;
/**
 * Encode a set of enveloped messages.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function encodeEnvelopes(...envelopes: EnvelopedMessage[]): Uint8Array<ArrayBuffer>;
