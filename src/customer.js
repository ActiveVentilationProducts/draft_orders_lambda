import { graphql, ShopifyError } from './shopify-client.js';

const FIND_CUSTOMER_QUERY = `
  query FindCustomerByEmail($searchQuery: String!) {
    customers(first: 1, query: $searchQuery) {
      nodes { id }
    }
  }
`;

const CREATE_CUSTOMER_MUTATION = `
  mutation CreateCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }
`;

async function findCustomerIdByEmail(email) {
  const escapedEmail = email.replace(/["\\]/g, '\\$&');
  const data = await graphql(FIND_CUSTOMER_QUERY, { searchQuery: `email:"${escapedEmail}"` });
  return data.customers.nodes[0]?.id ?? null;
}

/** Returns the customer GID for this email, creating the customer if needed. */
export async function findOrCreateCustomer({ email, firstName, lastName }) {
  const existingCustomerId = await findCustomerIdByEmail(email);
  if (existingCustomerId) return existingCustomerId;

  const data = await graphql(CREATE_CUSTOMER_MUTATION, {
    input: { email, firstName, lastName },
  });
  const { customer, userErrors } = data.customerCreate;

  if (userErrors.length) {
    // Search index can lag behind; if the email is "taken", search once more.
    const emailIsTaken = userErrors.some((userError) => /taken/i.test(userError.message));
    if (emailIsTaken) {
      const retriedCustomerId = await findCustomerIdByEmail(email);
      if (retriedCustomerId) return retriedCustomerId;
    }
    throw new ShopifyError('customerCreate returned userErrors', userErrors);
  }

  return customer.id;
}
