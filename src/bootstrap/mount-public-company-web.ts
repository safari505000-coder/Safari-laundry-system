import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';

/**
 * Production: serve `apps/public-web/dist` at `/` on the API host
 * (e.g. https://safariomni.com). Staff ERP stays on www.safariomni.com.
 */
export function mountPublicCompanyWebsite(
  app: NestExpressApplication,
): void {
  const distDir = join(process.cwd(), 'apps/public-web/dist');
  const indexHtml = join(distDir, 'index.html');
  if (!existsSync(indexHtml)) {
    Logger.log(
      'Public company website not mounted (missing apps/public-web/dist)',
      'Bootstrap',
    );
    return;
  }

  Logger.log(
    'Serving public company website from apps/public-web/dist at /',
    'Bootstrap',
  );

  const staticFiles = express.static(distDir, { index: false, maxAge: '1h' });

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const path = req.path;
    if (
      path.startsWith('/api') ||
      path.startsWith('/uploads') ||
      path.startsWith('/docs')
    ) {
      next();
      return;
    }

    staticFiles(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (res.headersSent) {
        return;
      }
      res.sendFile(indexHtml);
    });
  });
}
