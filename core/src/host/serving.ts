// `ServingHost`, `RouteTable`, `Route`, `PagesRequest`, `PagesResponse`, `Reader` — 05 §The serving host interface, verbatim. No imports.

/** What the server asks of whatever hosts HTTP. spec 05 §The serving host interface, R-S8–R-S10 */
export interface ServingHost {
  mount(routes: RouteTable): void;                        // register the server's routes under base()
  base(): string;                                         // the path prefix the routes live under: leading slash, no trailing slash, or "" for the root
  origin(): Promise<string | null>;                       // the external origin with scheme, if known (06 R8.15); used by `init` and `status` only
  ownOrigins(): Promise<string[]>;                        // every further origin the host answers as its own (03 R5.32a)
                                                          // no reader() method: the host fills PagesRequest.reader before handler runs (R-S8, N-8)
  files?: {                                               // optional: serve the page root by URL on this origin (§Own files by URL)
    url(session: string, relativePath: string): string;   //   a path relative to base(), under /page/<id>/
  };
  surface?(request: PagesRequest): Promise<{ canRecord: boolean }>;   // optional: the host application's surface denies the microphone (06 R8.37)
}

export type RouteTable = Route[];

export interface Route {
  method: "GET" | "POST";
  path: string;                                           // relative to base(): "/page", "/bridge", …; "/page/*" for the prefix strategy (R-S10)
  handler(request: PagesRequest): Promise<PagesResponse>;
}

export interface PagesRequest {
  method: "GET" | "POST";
  path: string;                                           // relative to base()
  query: URLSearchParams;
  headers: Headers;                                       // as received: Host and any X-Forwarded-* the reader's proxy set, unaltered
  body(): Promise<Uint8Array>;                            // readable once; the server bounds it (08)
  reader: Reader | null;                                  // resolved by the serving host before handler runs; the server only reads it and never resolves a reader itself
}

export interface PagesResponse {
  status: number;
  headers: Headers;                                       // the server sets every header it needs (R-S9)
  body: Uint8Array | ReadableStream<Uint8Array> | null;   // a stream for ranged or large files
}

export interface Reader { id: string }                    // opaque to the server; one value on a single-owner host
