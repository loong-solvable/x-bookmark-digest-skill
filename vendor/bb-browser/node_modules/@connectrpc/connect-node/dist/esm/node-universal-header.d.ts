import type * as http from "node:http";
import type * as http2 from "node:http2";
/**
 * Convert a Node.js header object to a fetch API Headers object.
 *
 * This function works for Node.js incoming and outgoing headers, and for the
 * http and the http2 package.
 *
 * HTTP/2 pseudo-headers (:method, :path, etc.) are stripped.
 */
export declare function nodeHeaderToWebHeader(nodeHeaders: http.OutgoingHttpHeaders | http.IncomingHttpHeaders | http2.IncomingHttpHeaders | http.IncomingMessage["trailers"]): Headers;
/**
 * Convert a fetch API Headers object to a Node.js headers object.
 *
 * Optionally accepts default Node.js headers as a dict or an array.
 * If provided, fetch API headers are appended to the defaults.
 * The original defaults headers are not modified.
 */
export declare function webHeaderToNodeHeaders(headersInit: HeadersInit, defaultNodeHeaders?: http.OutgoingHttpHeaders | readonly string[]): http.OutgoingHttpHeaders;
export declare function webHeaderToNodeHeaders(headersInit: HeadersInit | undefined): http.OutgoingHttpHeaders | undefined;
