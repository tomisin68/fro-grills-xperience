import { EventEmitter } from 'node:events';

/** In-process pub/sub that feeds the Server-Sent Event streams. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Starts an SSE response and returns a send(event, data) function. Cleans up on disconnect. */
export function openEventStream(req, res, onClose) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  // The response closes when the browser disconnects; req 'close' fires as soon as the GET body is read.
  res.on('close', () => {
    clearInterval(heartbeat);
    onClose?.();
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
