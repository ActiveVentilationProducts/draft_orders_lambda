import { graphql, assertNoUserErrors } from './shopify-client.js';

const CREATE_DRAFT_ORDER_MUTATION = `
  mutation CreateDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        createdAt
        subtotalPriceSet { shopMoney { amount currencyCode } }
        lineItems(first: 100) {
          nodes {
            name
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            image { url }
            product { onlineStoreUrl handle }
            customAttributes { key value }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

/** Cart properties object → customAttributes, dropping hidden (_-prefixed) and empty props. */
export function toCustomAttributes(cartProperties) {
  if (!cartProperties || typeof cartProperties !== 'object') return [];

  return Object.entries(cartProperties)
    .filter(([propertyName, propertyValue]) =>
      !propertyName.startsWith('_') && propertyValue !== null && String(propertyValue).trim() !== '')
    .map(([propertyName, propertyValue]) => ({ key: propertyName, value: String(propertyValue) }));
}

function toLineItems(cartItems) {
  return cartItems.map((cartItem) => ({
    variantId: `gid://shopify/ProductVariant/${cartItem.variant_id}`,
    quantity: cartItem.quantity,
    customAttributes: toCustomAttributes(cartItem.properties),
  }));
}

/** Country and state arrive as ISO codes already checked in validation.js. */
function toShippingAddress(contact) {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company || undefined,
    address1: contact.address || undefined,
    city: contact.city || undefined,
    provinceCode: contact.state,
    countryCode: contact.country,
    zip: contact.zip || undefined,
    phone: contact.phone || undefined,
  };
}

function getDraftOrderTags() {
  return (process.env.DRAFT_ORDER_TAGS ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Creates the draft order and returns the draftOrder object from the GraphQL response. */
export async function createDraftOrder({ customerId, contact, cartItems }) {
  const data = await graphql(CREATE_DRAFT_ORDER_MUTATION, {
    input: {
      purchasingEntity: { customerId },
      email: contact.email,
      note: contact.note || undefined,
      lineItems: toLineItems(cartItems),
      shippingAddress: toShippingAddress(contact),
      tags: getDraftOrderTags(),
    },
  });

  const { draftOrder, userErrors } = data.draftOrderCreate;
  assertNoUserErrors(userErrors, 'draftOrderCreate');
  return draftOrder;
}
