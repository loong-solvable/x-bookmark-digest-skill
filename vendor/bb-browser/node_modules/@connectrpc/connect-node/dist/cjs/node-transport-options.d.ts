import type { CommonTransportOptions, UniversalClientFn } from "@connectrpc/connect/protocol";
import type { NodeHttp2ClientSessionManager } from "./node-universal-client.js";
import type { Http2SessionOptions } from "./http2-session-manager.js";
import type * as http2 from "node:http2";
import type * as http from "node:http";
import type * as https from "node:https";
/**
 * Options specific to Node.js client transports that support HTTP/2 or HTTP 1.1.
 */
export type NodeTransportOptions = (NodeHttp1TransportOptions & {
    httpVersion: "1.1";
}) | (NodeHttp2TransportOptions & {
    httpVersion: "2";
});
/**
 * Options specific to Node.js client transports over HTTP/2.
 */
export type NodeHttp2TransportOptions = {
    /**
     * A manager for the HTTP/2 connection of the transport.
     *
     * Providing this option makes nodeOptions as well as the HTTP/2 session
     * options (pingIntervalMs et cetera) ineffective.
     */
    sessionManager?: NodeHttp2ClientSessionManager;
    /**
     * Options passed to the connect() call of the Node.js built-in
     * http2 module.
     */
    nodeOptions?: http2.ClientSessionOptions | http2.SecureClientSessionOptions;
} & Http2SessionOptions;
/**
 * Options specific to Node.js client transports over HTTP 1.1.
 */
type NodeHttp1TransportOptions = {
    /**
     * Options passed to the request() call of the Node.js built-in
     * http or https module.
     */
    nodeOptions?: Omit<http.RequestOptions, "signal"> | Omit<https.RequestOptions, "signal">;
};
/**
 * Asserts that the options are within sane limits, and returns default values
 * where no value is provided.
 *
 * @private Internal code, does not follow semantic versioning.
 */
export declare function validateNodeTransportOptions(options: NodeTransportOptions & Partial<Omit<CommonTransportOptions, "baseUrl">> & Pick<CommonTransportOptions, "baseUrl">): {
    readMaxBytes: number;
    writeMaxBytes: number;
    compressMinBytes: number;
    httpClient: UniversalClientFn;
    useBinaryFormat: boolean;
    interceptors: import("@connectrpc/connect").Interceptor[];
    sendCompression: import("@connectrpc/connect/protocol").Compression | null;
    acceptCompression: import("@connectrpc/connect/protocol").Compression[];
    /**
     * Options passed to the request() call of the Node.js built-in
     * http or https module.
     */
    nodeOptions?: Omit<http.RequestOptions, "signal"> | Omit<https.RequestOptions, "signal">;
    httpVersion: "1.1";
    jsonOptions?: Partial<import("@bufbuild/protobuf").JsonReadOptions & import("@bufbuild/protobuf").JsonWriteOptions> | undefined;
    binaryOptions?: Partial<import("@bufbuild/protobuf").BinaryReadOptions & import("@bufbuild/protobuf").BinaryWriteOptions> | undefined;
    useHttpGet?: boolean | undefined;
    defaultTimeoutMs?: number | undefined;
    baseUrl: string;
} | {
    readMaxBytes: number;
    writeMaxBytes: number;
    compressMinBytes: number;
    httpClient: UniversalClientFn;
    useBinaryFormat: boolean;
    interceptors: import("@connectrpc/connect").Interceptor[];
    sendCompression: import("@connectrpc/connect/protocol").Compression | null;
    acceptCompression: import("@connectrpc/connect/protocol").Compression[];
    /**
     * A manager for the HTTP/2 connection of the transport.
     *
     * Providing this option makes nodeOptions as well as the HTTP/2 session
     * options (pingIntervalMs et cetera) ineffective.
     */
    sessionManager?: NodeHttp2ClientSessionManager;
    /**
     * Options passed to the connect() call of the Node.js built-in
     * http2 module.
     */
    nodeOptions?: http2.ClientSessionOptions | http2.SecureClientSessionOptions;
    pingIntervalMs?: number;
    pingIdleConnection?: boolean;
    pingTimeoutMs?: number;
    idleConnectionTimeoutMs?: number;
    httpVersion: "2";
    jsonOptions?: Partial<import("@bufbuild/protobuf").JsonReadOptions & import("@bufbuild/protobuf").JsonWriteOptions> | undefined;
    binaryOptions?: Partial<import("@bufbuild/protobuf").BinaryReadOptions & import("@bufbuild/protobuf").BinaryWriteOptions> | undefined;
    useHttpGet?: boolean | undefined;
    defaultTimeoutMs?: number | undefined;
    baseUrl: string;
};
export {};
