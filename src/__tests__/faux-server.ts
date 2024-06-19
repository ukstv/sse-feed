import type { Server as HttpServer } from "node:http";
import type { Http2Server, Http2SecureServer } from "node:http2";
import type { Hono } from "hono";
import { serve } from "@hono/node-server";
import getPort from "get-port";

type UnderlyingServer = HttpServer | Http2SecureServer | Http2Server;

export class FauxServer {
  readonly #hono: Hono;
  readonly #port: number;

  #server: UnderlyingServer | undefined;

  constructor(hono: Hono, port: number) {
    this.#hono = hono;
    this.#server = undefined;
    this.#port = port;
  }

  get port(): number {
    return this.#port;
  }

  get url(): URL {
    return new URL(`http://localhost:${this.port}/`);
  }

  static async listen(hono: Hono, port?: number): Promise<FauxServer> {
    let effectivePort = port || (await getPort());
    const server = new FauxServer(hono, effectivePort);
    await server.start();
    return server;
  }

  private async start() {
    if (this.#server) {
      throw new Error(`Can not start a server twice`);
    }
    this.#server = await new Promise<UnderlyingServer>((resolve, reject) => {
      const server = serve({ fetch: this.#hono.fetch, port: this.#port });
      const cleanup = () => {
        server.removeListener("error", onError);
        server.removeListener("listening", onListening);
      };
      const onListening = () => {
        cleanup();
        resolve(server);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      server.on("listening", onListening);
      server.on("error", onError);
    });
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.#server) {
        return resolve();
      }
      this.#server.close((error) => {
        this.#server = undefined;
        if (error) {
          return reject(error);
        } else {
          return resolve();
        }
      });
    });
  }
}
