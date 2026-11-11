// Shopify Admin GraphQL client using the client credentials grant.
// The access token (~24h) is cached in module scope so warm Lambda invocations reuse it.

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

let cachedToken = null; // { accessToken, expiresAt }

export class ShopifyError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ShopifyError';
    this.details = details;
  }
}

const MAX_ERROR_BODY_LENGTH = 500;

/** Shopify sometimes returns a full HTML error page; keep just its <title> (e.g. "400 - Oauth error app_not_installed"). */
function summarizeErrorBody(responseText) {
  const htmlTitle = responseText.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  if (htmlTitle) return htmlTitle;
  return responseText.length > MAX_ERROR_BODY_LENGTH
    ? `${responseText.slice(0, MAX_ERROR_BODY_LENGTH)}…`
    : responseText;
}

function getShopifyConfig() {
  const {
    SHOPIFY_STORE_DOMAIN: storeDomain,
    SHOPIFY_CLIENT_ID: clientId,
    SHOPIFY_CLIENT_SECRET: clientSecret,
    SHOPIFY_API_VERSION: apiVersion,
  } = process.env;

  if (!storeDomain || !clientId || !clientSecret || !apiVersion) {
    throw new ShopifyError('Missing Shopify environment variables');
  }
  return { storeDomain, clientId, clientSecret, apiVersion };
}

async function fetchAccessToken() {
  const { storeDomain, clientId, clientSecret } = getShopifyConfig();

  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new ShopifyError(`Token request failed with HTTP ${response.status}`, summarizeErrorBody(responseText));
  }

  const tokenPayload = await response.json();
  const expiresInSeconds = Number(tokenPayload.expires_in) || 86_399;

  cachedToken = {
    accessToken: tokenPayload.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return cachedToken.accessToken;
}

async function getAccessToken() {
  const tokenIsFresh = cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS;
  return tokenIsFresh ? cachedToken.accessToken : fetchAccessToken();
}

async function postGraphql(accessToken, query, variables) {
  const { storeDomain, apiVersion } = getShopifyConfig();

  return fetch(`https://${storeDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Run a GraphQL query/mutation. Throws ShopifyError on HTTP or top-level GraphQL errors.
 * Mutation userErrors are NOT checked here — use assertNoUserErrors().
 */
export async function graphql(query, variables = {}) {
  let response = await postGraphql(await getAccessToken(), query, variables);

  // Token revoked or expired early: fetch a new one and retry once.
  if (response.status === 401) {
    cachedToken = null;
    response = await postGraphql(await getAccessToken(), query, variables);
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new ShopifyError(`GraphQL request failed with HTTP ${response.status}`, summarizeErrorBody(responseText));
  }

  const graphqlPayload = await response.json();
  if (graphqlPayload.errors?.length) {
    throw new ShopifyError('GraphQL returned errors', graphqlPayload.errors);
  }
  return graphqlPayload.data;
}

export function assertNoUserErrors(userErrors, operationName) {
  if (userErrors?.length) {
    throw new ShopifyError(`${operationName} returned userErrors`, userErrors);
  }
}
