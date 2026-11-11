// Lambda Function URL entry point.
// CORS is handled here — do NOT also enable CORS in the Function URL settings (duplicate headers break browsers).

import { validateRequest, ValidationError } from './validation.js';
import { findOrCreateCustomer } from './customer.js';
import { createDraftOrder } from './draft-order.js';
import { buildEmail } from './email-template.js';
import { sendConfirmation } from './mailer.js';

function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function buildCorsHeaders(requestOrigin) {
  if (!getAllowedOrigins().includes(requestOrigin)) return {};
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(statusCode, responseBody, corsHeaders) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(responseBody),
  };
}

function parseBody(event) {
  if (!event.body) throw new ValidationError('Missing request body');
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ValidationError('Body is not valid JSON');
  }
}

export async function handler(event) {
  const requestOrigin = event.headers?.origin ?? '';
  const corsHeaders = buildCorsHeaders(requestOrigin);
  const httpMethod = event.requestContext?.http?.method;

  if (httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders };
  if (httpMethod !== 'POST') return jsonResponse(405, { ok: false, error: 'Method not allowed' }, corsHeaders);
  if (!getAllowedOrigins().includes(requestOrigin)) {
    return jsonResponse(403, { ok: false, error: 'Origin not allowed' }, corsHeaders);
  }

  // 1. Validate
  let validatedRequest;
  try {
    validatedRequest = validateRequest(parseBody(event));
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonResponse(400, { ok: false, error: error.message }, corsHeaders);
    }
    throw error;
  }

  if (validatedRequest.isBot) {
    console.warn('Honeypot triggered; ignoring request');
    return jsonResponse(200, { ok: true }, corsHeaders);
  }

  const { contact, cartItems } = validatedRequest;

  // 2. Customer + draft order
  let draftOrder;
  try {
    const customerId = await findOrCreateCustomer({
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
    });
    draftOrder = await createDraftOrder({ customerId, contact, cartItems });
    console.log(`Created draft order ${draftOrder.name} (${draftOrder.id})`);
  } catch (error) {
    console.error('Shopify error', error.message, JSON.stringify(error.details ?? null));
    return jsonResponse(502, { ok: false, error: 'Could not create your quote. Please try again or contact us.' }, corsHeaders);
  }

  // 3. Email — failure is logged but does not fail the request (the order already exists).
  try {
    const { subject, html } = buildEmail({ draftOrder, firstName: contact.firstName });
    await sendConfirmation({ to: contact.email, subject, html });
  } catch (error) {
    console.error(`Confirmation email failed for ${draftOrder.name}`, error);
  }

  return jsonResponse(200, { ok: true, draftOrderName: draftOrder.name }, corsHeaders);
}
