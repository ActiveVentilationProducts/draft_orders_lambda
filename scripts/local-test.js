// Calls the handler once with a fake Function URL event. Hits the REAL store.
// Run: npm run test:local   (needs .env with TEST_VARIANT_ID, DRAFT_ORDER_TAGS=test, TEST_EMAIL_OVERRIDE)
import { handler } from '../src/handler.js';

const testVariantId = process.env.TEST_VARIANT_ID;
if (!testVariantId) {
  console.error('Set TEST_VARIANT_ID in .env to a real variant ID from the store.');
  process.exit(1);
}

const allowedOrigin = (process.env.ALLOWED_ORIGINS ?? '').split(',')[0].trim();

const sampleRequestBody = {
  itg_email: process.env.TEST_EMAIL_OVERRIDE || 'test@example.com',
  itg_fname: 'Test',
  itg_lname: 'Customer',
  itg_company: 'Test Co',
  itg_address: '123 Test St',
  itg_city: 'Testville',
  itg_state: 'MI',
  itg_zibcode: '48000',
  itg_country: 'US',
  itg_phone: '555-555-5555',
  itg_note: 'Local test — safe to delete.',
  itg_website: '',
  bundledata: [
    {
      variant_id: Number(testVariantId),
      quantity: 2,
      properties: { Color: 'Black', _hiddenProperty: 'should be filtered out' },
    },
  ],
};

const fakeEvent = {
  requestContext: { http: { method: 'POST' } },
  headers: { 'origin': allowedOrigin, 'content-type': 'application/json' },
  body: JSON.stringify(sampleRequestBody),
  isBase64Encoded: false,
};

const handlerResponse = await handler(fakeEvent);
console.log(JSON.stringify(handlerResponse, null, 2));
