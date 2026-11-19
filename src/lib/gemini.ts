import { getSettings, isSupabaseReady } from './config';

export type GeminiModel = {
  name: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

export type ThinkingEffort = 'low' | 'medium' | 'high' | 'ultra';

export type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

function getSupabaseFunctionUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');

  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(normalized)) {
    throw new Error(
      'Supabase URL tidak valid. Gunakan URL project seperti https://xxxxx.supabase.co'
    );
  }

  return `${normalized}/functions/v1/gemini-proxy`;
}

async function edgeRequest(
  idToken: string,
  apiKey: string,
  payload: Record<string, unknown>,
) {
  const settings = getSettings();

  if (!isSupabaseReady(settings)) {
    throw new Error(
      'Supabase URL dan publishable/anon key diperlukan untuk memanggil Edge Function Gemini.',
    );
  }

  const functionUrl = getSupabaseFunctionUrl(settings.supabaseUrl);

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      apikey: settings.supabaseAnonKey,
    },
    body: JSON.stringify({
      ...payload,
      apiKey,
    }),
  });

  const responseText = await response.text();

  let json: any = {};
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    const details =
      json?.error?.details?.error?.message ||
      json?.error?.details?.message ||
      json?.error?.message ||
      json?.message ||
      responseText;

    throw new Error(
      details ||
        `Gemini proxy returned HTTP ${response.status}.`,
    );
  }

  return json;
}

export async function listGeminiModels(
  idToken: string,
  apiKey: string,
): Promise<GeminiModel[]> {
  const data = await edgeRequest(idToken, apiKey, {
    action: 'models',
  });

  return (data.models || []).filter(
    (m: GeminiModel) =>
      m.name &&
      m.supportedGenerationMethods?.includes('generateContent'),
  );
}

export function supportsThinkingEffort(model: string) {
  const name = model.toLowerCase().replace(/^models\//, '');

  return (
    name.includes('gemini-2.5') ||
    name.includes('gemini-4-') ||
    [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
    ].some((supported) => name.includes(supported))
  );
}

export function supportsXHighThinking(model: string) {
  const normalized = model.toLowerCase();

  return (
    normalized.includes('gemini-4-neon') ||
    normalized.includes('gemini-4-hydrogen')
  );
}

function thinkingConfig(model: string, effort: ThinkingEffort) {
  const normalized = model.toLowerCase();

  if (!supportsThinkingEffort(normalized)) {
    return undefined;
  }

  const supportsXHigh = supportsXHighThinking(normalized);
  const selected =
    effort === 'ultra'
      ? supportsXHigh
        ? 'xhigh'
        : 'high'
      : effort;

  return {
    thinkingLevel: selected.toUpperCase(),
  };
}

export async function generateGeminiResponse(args: {
  idToken: string;
  apiKey: string;
  model: string;
  effort: ThinkingEffort;
  contents: GeminiContent[];
  systemInstruction?: string;
}) {
  const config: Record<string, unknown> = {
    maxOutputTokens: 8192,
    temperature: 0.7,
  };

  const thinking = thinkingConfig(args.model, args.effort);

  if (thinking) {
    config.thinkingConfig = thinking;
  }

  const body: Record<string, unknown> = {
    contents: args.contents,
    generationConfig: config,
  };

  if (args.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: args.systemInstruction }],
    };
  }

  return edgeRequest(args.idToken, args.apiKey, {
    action: 'generate',
    model: args.model,
    body,
  });
}

export function extractGeminiText(data: any): string {
  return (data?.candidates?.[0]?.content?.parts || [])
    .filter((p: any) => typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('\n')
    .trim();
}
