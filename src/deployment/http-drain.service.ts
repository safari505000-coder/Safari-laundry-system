import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** Stops accepting new HTTP connections before Nest closes workers/queues (best-effort no job loss). */
@Injectable()
export class HttpDrainService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(HttpDrainService.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.logger.warn(`http_drain_begin signal=${signal ?? 'unknown'}`);
    const server = this.httpAdapterHost.httpAdapter.getHttpServer();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    this.logger.warn('http_drain_complete');
  }
}
