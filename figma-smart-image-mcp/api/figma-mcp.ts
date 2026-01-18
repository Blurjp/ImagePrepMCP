import { FigmaSmartImageServer } from '../src/server.js';

// Create a singleton instance of the server
let serverInstance: FigmaSmartImageServer | null = null;

function getServerInstance(): FigmaSmartImageServer {
  if (!serverInstance) {
    serverInstance = new FigmaSmartImageServer('http');
  }
  return serverInstance;
}

// Vercel serverless function handler
export default async function handler(vercelReq: any, vercelRes: any) {
  const server = getServerInstance();

  // Set CORS headers
  vercelRes.setHeader('Access-Control-Allow-Origin', '*');
  vercelRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  vercelRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (vercelReq.method === 'OPTIONS') {
    return vercelRes.status(200).end();
  }

  try {
    // Call the server's handleRequest method
    await (server as any)['handleRequest'](vercelReq, vercelRes);
  } catch (error) {
    console.error('Error handling request:', error);
    vercelRes.status(500).json({ error: 'Internal server error' });
  }
}
