// Stand-in for Cloudflare's edge compression while measuring locally: the local preview serves
// HTML uncompressed, production does not. Listens on 3752 and forwards to the preview on 3751.
// Run: node tools/gzip-proxy.mjs   then point tools/lh.mjs at http://127.0.0.1:3752
import http from 'node:http';
import zlib from 'node:zlib';

const TARGET = { host: '127.0.0.1', port: 3751 };
http
  .createServer((req, res) => {
    const up = http.request({ ...TARGET, method: req.method, path: req.url, headers: { ...req.headers, host: `${TARGET.host}:${TARGET.port}`, 'accept-encoding': 'identity' } }, (r) => {
      const type = r.headers['content-type'] ?? '';
      const compress = /text\/|javascript|json|xml|svg|manifest/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      const headers = { ...r.headers };
      for (const k of ['location']) if (headers[k]) headers[k] = String(headers[k]).replace(':3751', ':3752');
      if (compress) {
        delete headers['content-length'];
        headers['content-encoding'] = 'gzip';
        res.writeHead(r.statusCode ?? 200, headers);
        r.pipe(zlib.createGzip({ level: 6 })).pipe(res);
      } else {
        res.writeHead(r.statusCode ?? 200, headers);
        r.pipe(res);
      }
    });
    up.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  })
  .listen(3752, '127.0.0.1', () => console.log('gzip proxy on http://127.0.0.1:3752 → 3751'));
