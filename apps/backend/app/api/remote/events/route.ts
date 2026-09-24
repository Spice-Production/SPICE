import { randomUUID } from 'node:crypto';

import { corsHeadersForRequest, jsonResponse, optionsResponse } from '@/lib/cors';
import { db, isNeonDatabaseUrl } from '@/db';
import { remoteDeviceAuthorizations, remoteDevices } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { isSpiceConnectRemoteDeviceVisible } from '@/lib/spice-connect';
import {
  createSpiceConnectProbeSignal,
  encodeSpiceConnectSseEvent,
  isSpiceConnectDeviceStateSignalFor,
  isSpiceConnectCommandSignalFor,
  parseSpiceConnectRealtimeSignal,
  spiceConnectRealtimeDatabaseUrl,
  SPICE_CONNECT_REALTIME_CHANNEL,
  SPICE_CONNECT_REALTIME_HEARTBEAT_MS,
  SPICE_CONNECT_REALTIME_PROBE_TIMEOUT_MS,
  SPICE_CONNECT_REALTIME_STREAM_LIFETIME_MS,
} from '@/lib/spice-connect-realtime';
import {
  isSpiceConnectRedisConfigured,
  readSpiceConnectDeviceStates,
  readSpiceConnectPairedAuthorization,
  subscribeSpiceConnectRedisSignals,
} from '@/lib/spice-connect-redis';
import {
  authorizeSpiceConnectRequest,
  requirePrincipalDevice,
  SpiceConnectAuthorizationError,
} from '@/lib/spice-connect-authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type NeonNotification = {
  channel?: string;
  payload?: string;
};

type NeonClient = {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  query(text: string, values?: unknown[]): Promise<unknown>;
  on(event: 'notification', listener: (notification: NeonNotification) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  removeListener(event: 'notification', listener: (notification: NeonNotification) => void): unknown;
  removeListener(event: 'error', listener: (error: Error) => void): unknown;
};

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

function redisRealtimeResponse(request: Request, userId: string, deviceId: string) {
  const subscriber = subscribeSpiceConnectRedisSignals<unknown>(userId);
  if (!subscriber) return null;

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let pendingEvents: Array<'command' | 'state'> = [];

  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (lifetimeTimer) clearTimeout(lifetimeTimer);
    request.signal.removeEventListener('abort', close);
    void subscriber.unsubscribe().catch(() => undefined);
    if (controller) {
      try {
        controller.close();
      } catch {
        // The client can cancel an SSE stream while cleanup is running.
      }
      controller = null;
    }
  };
  const send = (eventName: 'command' | 'state') => {
    if (!controller) {
      pendingEvents.push(eventName);
      return;
    }
    try {
      controller.enqueue(encoder.encode(encodeSpiceConnectSseEvent(eventName)));
    } catch {
      close();
    }
  };

  subscriber.on('message', (event) => {
    const signal = parseSpiceConnectRealtimeSignal(event.message);
    if (isSpiceConnectCommandSignalFor(signal, userId, deviceId)) send('command');
    else if (isSpiceConnectDeviceStateSignalFor(signal, userId)) send('state');
  });
  subscriber.on('error', () => close());

  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      nextController.enqueue(encoder.encode(encodeSpiceConnectSseEvent('ready')));
      for (const eventName of pendingEvents) {
        nextController.enqueue(encoder.encode(encodeSpiceConnectSseEvent(eventName)));
      }
      pendingEvents = [];
      heartbeatTimer = setInterval(() => {
        try {
          controller?.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          close();
        }
      }, SPICE_CONNECT_REALTIME_HEARTBEAT_MS);
      lifetimeTimer = setTimeout(close, SPICE_CONNECT_REALTIME_STREAM_LIFETIME_MS);
      request.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeadersForRequest(request),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, max-age=0, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Spice-Connect-Realtime': 'redis',
    },
  });
}

async function loadAvailableRemoteDevice(userId: string, deviceId: string, now: Date) {
  const device = await db.query.remoteDevices.findFirst({
    where: and(
      eq(remoteDevices.userId, userId),
      eq(remoteDevices.deviceId, deviceId),
    ),
  });
  if (!device) return null;

  const authorizations = await db.query.remoteDeviceAuthorizations.findMany({
    columns: { tokenHash: true, expiresAt: true, revokedAt: true },
    where: and(
      eq(remoteDeviceAuthorizations.userId, userId),
      eq(remoteDeviceAuthorizations.deviceId, deviceId),
    ),
  });
  return isSpiceConnectRemoteDeviceVisible(device.pairedAuthorizationHash, authorizations, now) ? device : null;
}

async function hasCachedAvailableRemoteDevice(userId: string, deviceId: string) {
  const states = await readSpiceConnectDeviceStates(userId);
  if (states === null) return null;
  const state = states.find((candidate) => candidate.deviceId === deviceId);
  // A Redis snapshot is populated by live heartbeats. Let PostgreSQL decide
  // about a device that has not yet written its first Redis state.
  if (!state) return null;
  if (!state.pairedAuthorizationHash) return true;
  const authorization = await readSpiceConnectPairedAuthorization(state.pairedAuthorizationHash);
  if (!authorization) return null;
  return authorization.userId === userId
    && authorization.deviceId === deviceId
    && authorization.authorizationHash === state.pairedAuthorizationHash;
}

export async function GET(request: Request) {
  let client: NeonClient | null = null;
  try {
    const principal = await authorizeSpiceConnectRequest(request);
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return jsonResponse(
        { error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' },
        { status: 500 },
        request,
      );
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId')?.slice(0, 120) || '';
    if (!deviceId) {
      return jsonResponse(
        { error: 'invalid_device', message: 'A deviceId query parameter is required.' },
        { status: 400 },
        request,
      );
    }
    requirePrincipalDevice(principal, deviceId);

    const cachedAvailability = await hasCachedAvailableRemoteDevice(principal.userId, deviceId);
    const receivingDevice = cachedAvailability === null
      ? await loadAvailableRemoteDevice(principal.userId, deviceId, new Date())
      : cachedAvailability;
    if (!receivingDevice) {
      return jsonResponse(
        { error: 'device_not_found', message: 'This Spice Connect receiver is not registered or authorized.' },
        { status: 404 },
        request,
      );
    }

    // Upstash replaces the long-lived direct PostgreSQL LISTEN connection on
    // Vercel. Keep the original Neon transport as a compatibility fallback
    // until Redis credentials are configured in every deployment environment.
    if (isSpiceConnectRedisConfigured()) {
      try {
        const redisResponse = redisRealtimeResponse(request, principal.userId, deviceId);
        if (redisResponse) return redisResponse;
      } catch (redisError) {
        console.warn(
          '[Spice Connect] Redis realtime subscription could not start; using PostgreSQL LISTEN fallback.',
          redisError,
        );
      }
    }

    // Self-hosted Postgres speaks raw PG TCP, not Neon's wire protocol, so
    // the Neon serverless client cannot LISTEN here. node-postgres exposes
    // the same notification interface over a direct connection.
    if (isNeonDatabaseUrl(databaseUrl)) {
      const { Client } = await import('@neondatabase/serverless');
      client = new Client({
        connectionString: spiceConnectRealtimeDatabaseUrl(databaseUrl),
        application_name: 'spice-connect-realtime',
      }) as unknown as NeonClient;
    } else {
      const { Client: PgClient } = await import('pg');
      client = new PgClient({
        connectionString: databaseUrl,
        application_name: 'spice-connect-realtime',
      }) as unknown as NeonClient;
    }

    const probeNonce = randomUUID();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let probeResolve: (() => void) | null = null;
    let probeReject: ((error: Error) => void) | null = null;
    let probeTimer: ReturnType<typeof setTimeout> | null = null;
    let closeStream: () => void = () => {};
    let pendingCommandWake = false;
    const encoder = new TextEncoder();

    const notificationListener = (notification: NeonNotification) => {
      if (notification.channel !== SPICE_CONNECT_REALTIME_CHANNEL) return;
      const signal = parseSpiceConnectRealtimeSignal(notification.payload);
      if (signal?.kind === 'probe' && signal.nonce === probeNonce) {
        probeResolve?.();
        return;
      }
      if (isSpiceConnectCommandSignalFor(signal, principal.userId, deviceId)) {
        if (!streamController) {
          pendingCommandWake = true;
          return;
        }
        try {
          streamController.enqueue(encoder.encode(encodeSpiceConnectSseEvent('command')));
        } catch {
          closeStream();
        }
      }
    };
    const errorListener = (error: Error) => {
      probeReject?.(error);
      closeStream();
    };

    client.on('notification', notificationListener);
    client.on('error', errorListener);
    await client.connect();
    await client.query(`LISTEN ${SPICE_CONNECT_REALTIME_CHANNEL}`);

    const probePromise = new Promise<void>((resolve, reject) => {
      probeResolve = resolve;
      probeReject = reject;
      probeTimer = setTimeout(() => {
        reject(new Error('The realtime database listener did not receive its readiness probe.'));
      }, SPICE_CONNECT_REALTIME_PROBE_TIMEOUT_MS);
    });
    try {
      await Promise.all([
        client.query('SELECT pg_notify($1, $2)', [
          SPICE_CONNECT_REALTIME_CHANNEL,
          createSpiceConnectProbeSignal(probeNonce),
        ]),
        probePromise,
      ]);
    } finally {
      if (probeTimer) clearTimeout(probeTimer);
    }
    probeResolve = null;
    probeReject = null;

    let closed = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
    const close = () => {
      if (closed) return;
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      request.signal.removeEventListener('abort', close);
      client?.removeListener('notification', notificationListener);
      client?.removeListener('error', errorListener);
      const closingClient = client;
      client = null;
      void closingClient?.end().catch(() => undefined);
      if (streamController) {
        try {
          streamController.close();
        } catch {
          // The response stream can be cancelled while cleanup is running.
        }
        streamController = null;
      }
    };
    closeStream = close;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(encoder.encode(encodeSpiceConnectSseEvent('ready')));
        if (pendingCommandWake) {
          pendingCommandWake = false;
          controller.enqueue(encoder.encode(encodeSpiceConnectSseEvent('command')));
        }
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch {
            close();
          }
        }, SPICE_CONNECT_REALTIME_HEARTBEAT_MS);
        lifetimeTimer = setTimeout(close, SPICE_CONNECT_REALTIME_STREAM_LIFETIME_MS);
        request.signal.addEventListener('abort', close, { once: true });
      },
      cancel() {
        close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeadersForRequest(request),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, max-age=0, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (client) {
      await client.end().catch(() => undefined);
    }
    if (error instanceof SpiceConnectAuthorizationError) {
      return jsonResponse({ error: error.code, message: error.message }, { status: error.status }, request);
    }
    return jsonResponse(
      {
        error: 'realtime_unavailable',
        message: 'Realtime Spice Connect wakeups are unavailable; command polling remains active.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      request,
    );
  }
}
