import type * as http from "node:http";
import type * as http2 from "node:http2";
import type { JsonValue } from "@bufbuild/protobuf";
import type { UniversalServerRequest, UniversalServerResponse } from "@connectrpc/connect/protocol";
import type { ContextValues } from "@connectrpc/connect";
/**
 * NodeHandlerFn is compatible with http.RequestListener and its equivalent
 * for http2.
 */
export type NodeHandlerFn = (request: NodeServerRequest, response: NodeServerResponse) => void;
/**
 * A Node.js server request from the http, https, or the http2 module.
 */
export type NodeServerRequest = http.IncomingMessage | http2.Http2ServerRequest;
/**
 * A Node.js server response from the http, https, or the http2 module.
 * Note that we are taking the liberty to patch the types of write()
 * and writeHead() so that they are compatible with each other.
 */
export type NodeServerResponse = (Omit<http.ServerResponse, "write"> | Omit<http2.Http2ServerResponse, "write">) & {
    write(chunk: string | Uint8Array, callback?: (err: Error | null | undefined) => void): boolean;
    write(chunk: string | Uint8Array, encoding: BufferEncoding, callback?: (err: Error | null | undefined) => void): boolean;
    writeHead(status: number, headers?: http.OutgoingHttpHeaders): unknown;
};
/**
 * Converts a Node.js server request to a UniversalServerRequest.
 * This function helps to implement adapters to server frameworks running
 * on Node.js. Please be careful using this function in your own code, as we
 * may have to make changes to it in the future.
 */
export declare function universalRequestFromNodeRequest(nodeRequest: NodeServerRequest, nodeResponse: NodeServerResponse, parsedJsonBody: JsonValue | undefined, contextValues: ContextValues | undefined): UniversalServerRequest;
/**
 * @deprecated
 */
export declare function universalRequestFromNodeRequest(nodeRequest: NodeServerRequest, parsedJsonBody: JsonValue | undefined, contextValues: ContextValues | undefined): UniversalServerRequest;
/**
 * Writes a UniversalServerResponse to a Node.js server response.
 * This function helps to implement adapters to server frameworks running
 * on Node.js. Please be careful using this function in your own code, as we
 * may have to make changes to it in the future.
 */
export declare function universalResponseToNodeResponse(universalResponse: UniversalServerResponse, nodeResponse: NodeServerResponse): Promise<void>;
