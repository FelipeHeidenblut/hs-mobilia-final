import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
};

const SUPPORTED_PROVIDERS = new Set([
  'demo',
  'openai',
  'pollinations',
]);
const MAX_GENERATOR_ITEMS = 4;

type Placement = Record<'x' | 'y' | 'width' | 'height', number>;

type GenerationItem = {
  productId: string;
  textureId: string;
  placement: Placement;
};

type ResolvedGenerationItem = GenerationItem & {
  product: Record<string, unknown>;
  texture: Record<string, unknown>;
};

class GenerationError extends Error {
  code: string;
  publicMessage: string;

  constructor(code: string, publicMessage: string, logMessage = publicMessage) {
    super(logMessage);
    this.name = 'GenerationError';
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function validOwnedPath(value: unknown, userId: string) {
  const path = cleanText(value, 500);
  return path.startsWith(`${userId}/`)
    && !path.includes('..')
    && /^[a-zA-Z0-9/_\-.]+$/.test(path);
}

function validPlacement(value: unknown) {
  const placement = asRecord(value);
  const fields = ['x', 'y', 'width', 'height'] as const;
  const normalized = Object.fromEntries(fields.map((field) => [
    field,
    Number(placement[field]),
  ])) as Record<typeof fields[number], number>;

  return fields.every((field) => Number.isFinite(normalized[field]))
    && normalized.x >= 0
    && normalized.y >= 0
    && normalized.width > 0
    && normalized.height > 0
    && normalized.x + normalized.width <= 1.001
    && normalized.y + normalized.height <= 1.001
    ? normalized
    : null;
}

function validGenerationItem(value: unknown): GenerationItem | null {
  const item = asRecord(value);
  const productId = cleanText(item.productId, 100);
  const textureId = cleanText(item.textureId, 100);
  const placement = validPlacement(item.placement);

  return productId && textureId && placement
    ? { productId, textureId, placement }
    : null;
}

function validOriginal(value: unknown) {
  const original = asRecord(value);
  const width = Number(original.width);
  const height = Number(original.height);

  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 64
    || height < 64
    || width > 12000
    || height > 12000
  ) return null;

  return { width, height };
}

function imageSize(width: number, height: number) {
  const ratio = width / height;
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

function mimeExtension(contentType: string) {
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
}

function providerErrorForStatus(
  status: number,
  details = '',
  provider = '',
) {
  if ([401, 403].includes(status)) {
    return new GenerationError(
      'PROVIDER_AUTH_ERROR',
      'A chave da API de imagem é inválida ou não possui autorização.',
      `Provedor retornou ${status}: ${details}`,
    );
  }

  if (status === 402) {
    return new GenerationError(
      'PROVIDER_CREDITS_EXHAUSTED',
      'A API de imagem está sem créditos ou saldo disponível.',
      `Provedor retornou 402: ${details}`,
    );
  }

  if (status === 429) {
    return new GenerationError(
      'PROVIDER_RATE_LIMIT',
      'A API de imagem atingiu o limite de solicitações. Aguarde alguns minutos e tente novamente.',
      `Provedor retornou 429: ${details}`,
    );
  }

  if (status === 400 || status === 422) {
    return new GenerationError(
      'PROVIDER_REQUEST_REJECTED',
      'A API de imagem recusou os parâmetros da geração. Verifique o modelo configurado.',
      `Provedor retornou ${status}: ${details}`,
    );
  }

  if (status === 413) {
    return new GenerationError(
      'PROVIDER_FILE_TOO_LARGE',
      'Os arquivos ultrapassaram o limite aceito pela API de imagem.',
      `Provedor retornou 413: ${details}`,
    );
  }

  return new GenerationError(
    'PROVIDER_UNAVAILABLE',
    'A API de imagem está indisponível no momento. Tente novamente mais tarde.',
    `Provedor retornou ${status}: ${details}`,
  );
}

function base64ToBytes(value: string) {
  const base64 = value.includes(',') ? value.split(',').pop() || '' : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function fetchImage(url: string, label: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`${label} possui uma URL inválida.`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`${label} possui uma URL inválida.`);
  }

  const response = await fetch(parsedUrl);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar ${label.toLowerCase()}.`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  if (!contentType.startsWith('image/')) {
    throw new Error(`${label} não retornou uma imagem.`);
  }

  return new Blob([await response.arrayBuffer()], { type: contentType });
}

function buildPrompt({ items, instructions }: {
  items: ResolvedGenerationItem[];
  instructions: string;
}) {
  const userDirection = cleanText(instructions, 600);
  const itemInstructions = items.flatMap((item, index) => {
    const productName = cleanText(item.product.name, 120)
      || 'móvel de referência';
    const productCategory = cleanText(item.product.category, 80)
      || 'móvel';
    const productDescription = cleanText(item.product.description, 240);
    const textureName = cleanText(item.texture.nome, 120)
      || 'acabamento de referência';
    const textureMaterial = cleanText(item.texture.categoria, 80)
      || 'acabamento';
    const productImageIndex = 2 + index * 2;
    const textureImageIndex = productImageIndex + 1;

    return [
      `ITEM ${index + 1}: Use exactly the furniture from image ${productImageIndex} and the material from image ${textureImageIndex}.`,
      `Furniture identification: ${productCategory} ${productName}.`,
      productDescription
        ? `Supporting characteristics: ${productDescription}.`
        : '',
      `Material identification: ${textureMaterial}; ${textureName}.`,
      `Place ITEM ${index + 1} in this normalized region: x ${item.placement.x}, y ${item.placement.y}, width ${item.placement.width}, height ${item.placement.height}.`,
      `Add exactly one instance of ITEM ${index + 1} in that region.`,
    ];
  });

  return [
    'IMPORTANT: Follow the PROFESSIONAL DIRECTION exactly. It has priority over automatic composition and aesthetic choices.',
    userDirection
      ? `PROFESSIONAL DIRECTION: ${userDirection}`
      : 'PROFESSIONAL DIRECTION: Follow the marked positions and preserve the original room.',
    `Create one composition with exactly ${items.length} furniture ${items.length === 1 ? 'item' : 'items'}.`,
    'Image 1 is the original room. Every following pair contains the furniture image and its material image for the corresponding numbered item.',
    'Edit only the transparent regions in the room mask.',
    ...itemInstructions,
    'Apply the PROFESSIONAL DIRECTION to the relevant numbered items, including requested orientation, rotation, spacing, alignment and relationships between them.',
    'Keep the architecture, camera angle, existing furniture, lighting, colors and everything outside the mask unchanged.',
    'Preserve the design, proportions and construction details of every reference furniture item. Never mix features between items.',
    'Match perspective, scale, floor contact, occlusion, lighting and shadows separately for every item.',
    `Do not invent extra furniture. The result must contain only the ${items.length} requested items inside the marked regions.`,
    'Do not add text, logos or people.',
    userDirection
      ? `FINAL CHECK — obey this direction before producing the image: ${userDirection}`
      : '',
  ].filter(Boolean).join('\n');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Serviço não configurado.' }, 500);
  }
  if (!token) return jsonResponse({ error: 'Sessão obrigatória.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;

  if (authError || !user) {
    return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
  }

  const [{ data: profile }, { data: adminUser }] = await Promise.all([
    admin.from('architects').select('status').eq('user_id', user.id).maybeSingle(),
    admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);

  if (profile?.status !== 'approved' && !adminUser) {
    return jsonResponse({ error: 'Acesso profissional não aprovado.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = asRecord(await request.json());
  } catch {
    return jsonResponse({ error: 'Dados inválidos.' }, 400);
  }

  const jobId = cleanText(body.jobId, 80);
  const roomPath = cleanText(body.roomPath, 500);
  const maskPath = cleanText(body.maskPath, 500);
  const instructions = cleanText(body.instructions, 600);
  const quality = body.quality === 'final' ? 'final' : 'draft';
  const original = validOriginal(body.original);
  const legacyItem = {
    productId: body.productId,
    textureId: body.textureId,
    placement: body.placement,
  };
  const rawItems = Array.isArray(body.items)
    ? body.items
    : [legacyItem];
  const parsedItems = rawItems.map(validGenerationItem);
  const hasInvalidItems = parsedItems.some((item) => !item);
  const requestedItems = parsedItems as GenerationItem[];

  if (
    !/^[0-9a-f-]{36}$/i.test(jobId)
    || !validOwnedPath(roomPath, user.id)
    || !validOwnedPath(maskPath, user.id)
    || !original
    || rawItems.length < 1
    || rawItems.length > MAX_GENERATOR_ITEMS
    || hasInvalidItems
  ) return jsonResponse({ error: 'Dados do projeto incompletos.' }, 400);

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const dailyLimit = Math.max(1, Math.min(
    100,
    Number(Deno.env.get('AI_DAILY_LIMIT')) || 10,
  ));
  const { count: dailyCount } = await admin
    .from('ai_generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', startOfDay.toISOString())
    .neq('status', 'failed');

  if ((dailyCount || 0) >= dailyLimit) {
    return jsonResponse({
      error: `Limite diário de ${dailyLimit} gerações atingido.`,
      code: 'DAILY_LIMIT_REACHED',
    }, 429);
  }

  const provider = cleanText(
    Deno.env.get('IMAGE_API_PROVIDER') || 'demo',
    30,
  ).toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return jsonResponse({ error: 'Provedor de imagem inválido.' }, 500);
  }

  const model = cleanText(
    Deno.env.get('IMAGE_API_MODEL')
      || (provider === 'openai'
        ? 'gpt-image-2'
        : 'klein'),
    100,
  );
  const productIds = [...new Set(
    requestedItems.map((item) => item.productId),
  )];
  const textureIds = [...new Set(
    requestedItems.map((item) => item.textureId),
  )];
  const [productResult, textureResult] = await Promise.all([
    admin.from('products')
      .select('id,name,category,description,image_url')
      .in('id', productIds),
    admin.from('acabamentos')
      .select('id,categoria,nome,imagem_url')
      .in('id', textureIds),
  ]);

  const productMap = new Map(
    (productResult.data || []).map((product) => [String(product.id), product]),
  );
  const textureMap = new Map(
    (textureResult.data || []).map((texture) => [String(texture.id), texture]),
  );
  const resolvedItems = requestedItems.map((item) => ({
    ...item,
    product: productMap.get(item.productId),
    texture: textureMap.get(item.textureId),
  }));

  if (
    productResult.error
    || textureResult.error
    || resolvedItems.some((item) => !item.product || !item.texture)
  ) return jsonResponse({ error: 'Peça ou acabamento não encontrado.' }, 404);

  const generationItems = resolvedItems as ResolvedGenerationItem[];
  const prompt = buildPrompt({ items: generationItems, instructions });
  const primaryItem = generationItems[0];
  const { error: insertError } = await admin.from('ai_generation_jobs').insert({
    id: jobId,
    user_id: user.id,
    product_id: primaryItem.productId,
    texture_id: primaryItem.textureId,
    input_path: roomPath,
    mask_path: maskPath,
    provider,
    model: provider === 'demo' ? null : model,
    quality,
    prompt,
    status: 'processing',
  });

  if (insertError) {
    console.error('Erro ao registrar geração:', insertError);
    return jsonResponse({ error: 'Não foi possível iniciar a geração.' }, 500);
  }

  try {
    if (provider === 'demo') {
      const { data: signedRoom, error: signedRoomError } = await admin.storage
        .from('ai-projects')
        .createSignedUrl(roomPath, 60 * 60);

      if (signedRoomError || !signedRoom?.signedUrl) {
        throw signedRoomError || new Error('Imagem de demonstração indisponível.');
      }

      await admin.from('ai_generation_jobs').update({
        result_path: roomPath,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);

      return jsonResponse({ jobId, resultUrl: signedRoom.signedUrl, demo: true });
    }

    const apiKey = Deno.env.get('IMAGE_API_KEY');
    const apiBaseUrl = cleanText(
      Deno.env.get('IMAGE_API_BASE_URL') || (provider === 'openai'
        ? 'https://api.openai.com/v1'
        : 'https://gen.pollinations.ai/v1'),
      300,
    ).replace(/\/$/, '');

    if (!apiKey || !apiBaseUrl.startsWith('https://')) {
      throw new GenerationError(
        'PROVIDER_NOT_CONFIGURED',
        'A API de imagem ainda não foi configurada no Supabase.',
      );
    }

    const multipart = new FormData();
    const apiEndpoint = `${apiBaseUrl}/images/edits`;

    const [roomDownload, maskDownload, ...referenceImages] = await Promise.all([
      admin.storage.from('ai-projects').download(roomPath),
      admin.storage.from('ai-projects').download(maskPath),
      ...generationItems.flatMap((item, index) => [
        fetchImage(
          String(item.product.image_url || ''),
          `Imagem da peça ${index + 1}`,
        ),
        fetchImage(
          String(item.texture.imagem_url || ''),
          `Imagem do acabamento ${index + 1}`,
        ),
      ]),
    ]);

    if (roomDownload.error || !roomDownload.data) {
      throw roomDownload.error || new Error('Imagem do ambiente indisponível.');
    }
    if (maskDownload.error || !maskDownload.data) {
      throw maskDownload.error || new Error('Máscara indisponível.');
    }

    const imageField = provider === 'openai' ? 'image[]' : 'image';
    multipart.append(imageField, roomDownload.data, 'room.png');
    referenceImages.forEach((image, index) => {
      const itemNumber = Math.floor(index / 2) + 1;
      const referenceType = index % 2 === 0 ? 'product' : 'texture';
      multipart.append(
        imageField,
        image,
        `item-${itemNumber}-${referenceType}.png`,
      );
    });
    multipart.append('mask', maskDownload.data, 'mask.png');
    multipart.append('prompt', prompt);
    multipart.append('model', model);
    multipart.append('size', imageSize(original.width, original.height));
    multipart.append('quality', quality === 'final' ? 'high' : 'low');

    if (provider === 'pollinations') {
      multipart.append('response_format', 'b64_json');
    }

    const apiResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(provider === 'pollinations'
          ? { 'Pollinations-Safe': 'privacy,secrets' }
          : {}),
      },
      body: multipart,
    });
    let resultBytes: Uint8Array;
    let resultContentType = apiResponse.headers.get('content-type') || 'image/png';

    if (resultContentType.startsWith('image/')) {
      resultBytes = new Uint8Array(await apiResponse.arrayBuffer());
    } else {
      const apiPayload = asRecord(await apiResponse.json());
      if (!apiResponse.ok) {
        const apiError = asRecord(apiPayload.error);
        const apiErrors = Array.isArray(apiPayload.errors)
          ? apiPayload.errors.map(String).join(' ')
          : '';
        throw providerErrorForStatus(
          apiResponse.status,
          cleanText(apiError.message || apiErrors, 300),
          provider,
        );
      }

      const firstResult = Array.isArray(apiPayload.data)
        ? asRecord(apiPayload.data[0])
        : {};
      const base64Result = cleanText(firstResult.b64_json, 30_000_000);
      const remoteResultUrl = cleanText(firstResult.url || firstResult.image_url, 2000);

      if (base64Result) {
        resultBytes = base64ToBytes(base64Result);
        resultContentType = 'image/png';
      } else if (remoteResultUrl) {
        const remoteResult = await fetchImage(remoteResultUrl, 'Resultado');
        resultBytes = new Uint8Array(await remoteResult.arrayBuffer());
        resultContentType = remoteResult.type || 'image/png';
      } else {
        throw new Error('A API não retornou uma imagem.');
      }
    }

    if (!apiResponse.ok) {
      throw providerErrorForStatus(
        apiResponse.status,
        '',
        provider,
      );
    }

    const resultPath = `${user.id}/${jobId}/result.${mimeExtension(resultContentType)}`;
    const { error: uploadError } = await admin.storage.from('ai-projects').upload(
      resultPath,
      resultBytes,
      { contentType: resultContentType, upsert: true },
    );
    if (uploadError) throw uploadError;

    const { data: signedResult, error: signedResultError } = await admin.storage
      .from('ai-projects')
      .createSignedUrl(resultPath, 60 * 60);
    if (signedResultError || !signedResult?.signedUrl) {
      throw signedResultError || new Error('Resultado indisponível.');
    }

    await admin.from('ai_generation_jobs').update({
      result_path: resultPath,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    return jsonResponse({ jobId, resultUrl: signedResult.signedUrl, demo: false });
  } catch (error) {
    const errorMessage = cleanText(
      error instanceof Error ? error.message : error,
      500,
    ) || 'Falha desconhecida.';
    console.error('Erro na geração de imagem:', errorMessage);

    await admin.from('ai_generation_jobs').update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    const publicError = error instanceof GenerationError
      ? error
      : new GenerationError(
        'GENERATION_FAILED',
        'Não foi possível gerar a ambientação. Tente novamente em alguns instantes.',
        errorMessage,
      );

    return jsonResponse({
      error: publicError.publicMessage,
      code: publicError.code,
    }, 502);
  }
});
