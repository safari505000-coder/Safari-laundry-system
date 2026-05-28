import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import {
  isPublicCompanyWebsiteHost,
  isStaffErpWebsiteHost,
  staffErpLoginRedirectUrl,
} from './website-host-routing';

function apiOrAssetPath(path: string): boolean {
  return (
    path.startsWith('/api') ||
    path.startsWith('/uploads') ||
    path.startsWith('/docs')
  );
}

function mountSpaStaticRoot(
  app: NestExpressApplication,
  distDir: string,
  label: string,
  hostFilter: (hostname: string) => boolean,
): void {
  const indexHtml = join(distDir, 'index.html');
  if (!existsSync(indexHtml)) {
    Logger.log(`${label} not mounted (missing ${indexHtml})`, 'Bootstrap');
    return;
  }

  Logger.log(`Serving ${label} from ${distDir}`, 'Bootstrap');

  const staticFiles = express.static(distDir, {
    index: false,
    maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0,
  });

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const hostname = req.hostname ?? '';
    if (!hostFilter(hostname)) {
      next();
      return;
    }
    if (apiOrAssetPath(req.path)) {
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

/**
 * Host-aware frontends on the API process:
 *   • apex (safariomni.com) → public company website
 *   • www → staff ERP SPA
 *   • /login on apex → redirect to www ERP login
 */
export function mountHostAwareWebFrontends(
  app: NestExpressApplication,
): void {
  const publicDir = join(process.cwd(), 'apps/public-web/dist');
  const erpDir = join(process.cwd(), 'web/dist');
  const hasPublic = existsSync(join(publicDir, 'index.html'));
  const hasErp = existsSync(join(erpDir, 'index.html'));

  if (!hasPublic && !hasErp) {
    Logger.log('No web frontends to mount', 'Bootstrap');
    return;
  }

  if (hasPublic) {
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      const hostname = req.hostname ?? '';
      if (
        isPublicCompanyWebsiteHost(hostname) &&
        req.path === '/login'
      ) {
        res.redirect(302, staffErpLoginRedirectUrl());
        return;
      }
      next();
    });

    mountSpaStaticRoot(
      app,
      publicDir,
      'public company website',
      isPublicCompanyWebsiteHost,
    );
  }

  if (hasErp) {
    mountSpaStaticRoot(
      app,
      erpDir,
      'staff ERP SPA',
      isStaffErpWebsiteHost,
    );
  }
}

/** @deprecated Use mountHostAwareWebFrontends — kept as alias for imports. */
export function mountPublicCompanyWebsite(
  app: NestExpressApplication,
): void {
  mountHostAwareWebFrontends(app);
}
