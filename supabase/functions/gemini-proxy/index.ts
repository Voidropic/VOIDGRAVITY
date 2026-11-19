import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const jwks = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

async function authenticateFirebase(req: Request) {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');

  if (!projectId) {
    throw new Error('Server configuration missing FIREBASE_PROJECT_ID.');
  }

  const token = req.headers
    .get('Authorization')
    ?.replace(/^Bearer\s+/i, '');

  if (!token) {
    throw new Error('Missing Firebase ID token.');
  }

  const result = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  if (!result.payload.sub) {
    throw new Error('Invalid Firebase user identity.');
  }

  return String(result.payload.sub);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(
      { error: { message: 'Method not allowed.' } },
      405,
    );
  }

  try {
    await authenticateFirebase(req);

    const body = await req.json();

    const apiKey =
      typeof body.apiKey === 'string'
        ? body.apiKey.trim()
        : '';

    const action = body.action;

    if (!apiKey || apiKey.length > 300) {
      return json(
        {
          error: {
            message: 'A valid Gemini API key is required.',
          },
        },
        400,
      );
    }

    let upstream: Response;

    if (action === 'models') {
      const url = new URL(
        'https://generativelanguage.googleapis.com/v1beta/models',
      );

      url.searchParams.set('pageSize', '1000');

      upstream = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-goog-api-key': apiKey,
        },
      });
    } else if (action === 'generate') {
      const model =
        typeof body.model === 'string'
          ? body.model.replace(/^models\//, '').trim()
          : '';

      if (!/^[a-zA-Z0-9._-]{2,120}$/.test(model)) {
        return json(
          {
            error: {
              message: 'Invalid model identifier.',
            },
          },
          400,
        );
      }

      if (
        !body.body ||
        typeof body.body !== 'object' ||
        Array.isArray(body.body)
      ) {
        return json(
          {
            error: {
              message: 'Missing Gemini request body.',
            },
          },
          400,
        );
      }

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent`;

      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body.body),
      });
    } else {
      return json(
        {
          error: {
            message: 'Unknown action.',
          },
        },
        400,
      );
    }

    const responseText = await upstream.text();

    if (!upstream.ok) {
      let details: unknown;

      try {
        details = responseText
          ? JSON.parse(responseText)
          : { message: `HTTP ${upstream.status}` };
      } catch {
        details = {
          message: responseText.slice(0, 1000),
        };
      }

      const upstreamMessage =
        typeof details === 'object' &&
        details !== null &&
        'error' in details &&
        typeof (details as any).error?.message === 'string'
          ? (details as any).error.message
          : typeof (details as any)?.message === 'string'
            ? (details as any).message
            : `Gemini API returned HTTP ${upstream.status}.`;

      return json(
        {
          error: {
            message: upstreamMessage,
            details,
          },
        },
        upstream.status,
      );
    }

    try {
      return json(JSON.parse(responseText));
    } catch {
      return json(
        {
          error: {
            message: 'Gemini returned an invalid JSON response.',
          },
        },
        502,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Request failed.';

    const status =
      message.includes('Missing Firebase') ||
      message.includes('Invalid Firebase')
        ? 401
        : message.includes('configuration missing')
          ? 500
          : 400;

    return json(
      {
        error: {
          message,
        },
      },
      status,
    );
  }
});
