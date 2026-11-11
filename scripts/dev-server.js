// Local HTTP wrapper around the handler, for testing with `shopify theme dev`.
// Run: npm run dev   → http://localhost:3000
import { createServer } from 'node:http';
import { handler } from '../src/handler.js';

const PORT = Number(process.env.PORT) || 3000;

const devServer = createServer(async (request, response) => {
  const bodyChunks = [];
  for await (const bodyChunk of request) bodyChunks.push(bodyChunk);

  const fakeEvent = {
    requestContext: { http: { method: request.method } },
    headers: request.headers, // Node already lowercases header names, like Function URLs do
    body: bodyChunks.length ? Buffer.concat(bodyChunks).toString('utf8') : undefined,
    isBase64Encoded: false,
  };

  try {
    const handlerResponse = await handler(fakeEvent);
    response.writeHead(handlerResponse.statusCode, handlerResponse.headers);
    response.end(handlerResponse.body ?? '');
  } catch (error) {
    console.error('Unhandled handler error', error);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: 'Internal error' }));
  }

  console.log(`${request.method} ${request.url} → ${response.statusCode}`);
});

devServer.listen(PORT, () => console.log(`Dev server on http://localhost:${PORT}`));
