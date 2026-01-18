import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { FigmaSmartImageServer } from '../dist/server.js';

// Create a singleton instance of the server
let serverInstance: FigmaSmartImageServer | null = null;
let httpServer: any = null;

function getServerInstance(): FigmaSmartImageServer {
  if (!serverInstance) {
    serverInstance = new FigmaSmartImageServer('http');
  }
  return serverInstance;
}

// Adapt Vercel request to Node.js IncomingMessage
function adaptVercelRequest(vercelReq: any, req: IncomingMessage) {
  req.method = vercelReq.method || 'GET';
  req.url = vercelReq.url || '/';
  (req as any).headers = vercelReq.headers || {};

  // Handle body
  if (vercelReq.body) {
    (req as any).body = vercelReq.body;
  }
}

// Adapt Node.js ServerResponse to Vercel response
function adaptVercelResponse(res: ServerResponse, vercelRes: any) {
  const originalWriteHead = res.writeHead;
  const originalEnd = res.end;
  const originalWrite = res.write;

  let statusCode = 200;
  let headers: any = {};

  res.writeHead = function (code: number, headersArg?: any) {
    statusCode = code;
    if (headersArg) {
      headers = headersArg;
    }
    return originalWriteHead.call(this, code, headersArg);
  };

  res.write = function (chunk: any) {
    // Buffer the chunks
    return originalWrite.call(this, chunk);
  };

  res.end = function (chunk?: any) {
    if (chunk) {
      originalWrite.call(this, chunk);
    }
    originalEnd.call(this);

    // Send response to Vercel
    vercelRes.status(statusCode);
    Object.keys(headers).forEach(key => {
      vercelRes.setHeader(key, headers[key]);
    });
    vercelRes.send(Buffer.concat((this as any).outputData || []));
  };
}

// Vercel serverless function handler
export default async function handler(vercelReq: any, vercelRes: any) {
  const server = getServerInstance();

  // Create mock Node.js request and response
  const req = new IncomingMessage(null as any);
  const res = new ServerResponse(req);

  adaptVercelRequest(vercelReq, req);
  adaptVercelResponse(res, vercelRes);

  // Handle the request using the server's HTTP handler
  await server['handleRequest'](req, res);
}
