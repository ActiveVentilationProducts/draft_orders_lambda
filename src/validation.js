// Validates and normalizes the incoming quote request.
import { isValidCountryCode, isValidRegionCode } from './regions.js';

const MAX_CART_ITEMS = 100;
const MAX_QUANTITY = 10_000;
const MAX_FIELD_LENGTH = 255;
const MAX_NOTE_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/;

// Hidden form field; real users leave it empty.
export const HONEYPOT_FIELD = 'itg_website';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function readText(requestBody, fieldName, { required = false, maxLength = MAX_FIELD_LENGTH } = {}) {
  const rawValue = requestBody[fieldName];
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (required && !trimmedValue) throw new ValidationError(`${fieldName} is required`);
  if (trimmedValue.length > maxLength) throw new ValidationError(`${fieldName} is too long`);
  return trimmedValue;
}

/** bundledata may arrive as a JSON string (old FormData flow) or a real array (new JSON flow). */
function readCartItems(bundleData) {
  let cartItems = bundleData;
  if (typeof bundleData === 'string') {
    try {
      cartItems = JSON.parse(bundleData);
    } catch {
      throw new ValidationError('bundledata is not valid JSON');
    }
  }

  if (!Array.isArray(cartItems) || cartItems.length === 0) throw new ValidationError('Cart is empty');
  if (cartItems.length > MAX_CART_ITEMS) throw new ValidationError('Too many cart items');

  return cartItems.map((cartItem) => {
    const variantId = Number(cartItem?.variant_id);
    const quantity = Number(cartItem?.quantity);

    if (!Number.isSafeInteger(variantId) || variantId <= 0) throw new ValidationError('Invalid variant_id');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) throw new ValidationError('Invalid quantity');

    return { variant_id: variantId, quantity, properties: cartItem.properties ?? null };
  });
}

/** Returns { isBot } or { contact, cartItems }. Throws ValidationError on bad input. */
export function validateRequest(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') throw new ValidationError('Body must be a JSON object');

  if (typeof requestBody[HONEYPOT_FIELD] === 'string' && requestBody[HONEYPOT_FIELD].trim() !== '') {
    return { isBot: true };
  }

  const email = readText(requestBody, 'itg_email', { required: true });
  if (!EMAIL_PATTERN.test(email)) throw new ValidationError('itg_email is not a valid email');

  const contact = {
    email,
    firstName: readText(requestBody, 'itg_fname', { required: true, maxLength: 100 }),
    lastName: readText(requestBody, 'itg_lname', { required: true, maxLength: 100 }),
    company: readText(requestBody, 'itg_company'),
    address: readText(requestBody, 'itg_address'),
    city: readText(requestBody, 'itg_city'),
    state: readText(requestBody, 'itg_state', { required: true }).toUpperCase(),
    zip: readText(requestBody, 'itg_zibcode', { maxLength: 20 }),
    country: readText(requestBody, 'itg_country', { required: true }).toUpperCase(),
    phone: readText(requestBody, 'itg_phone', { maxLength: 30 }),
    note: readText(requestBody, 'itg_note', { maxLength: MAX_NOTE_LENGTH }),
  };

  if (!isValidCountryCode(contact.country)) throw new ValidationError('itg_country is not a supported country code');
  if (!isValidRegionCode(contact.state, contact.country)) throw new ValidationError('itg_state is not a valid code for this country');

  return { isBot: false, contact, cartItems: readCartItems(requestBody.bundledata) };
}
