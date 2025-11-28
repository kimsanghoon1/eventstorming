import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client/core';

// HTTP connection to the API
const httpLink = createHttpLink({
    uri: 'http://localhost:3000/graphql',
});

// Cache implementation
const cache = new InMemoryCache();

// Create the apollo client
export const apolloClient = new ApolloClient({
    link: httpLink,
    cache,
    defaultOptions: {
        watchQuery: {
            fetchPolicy: 'cache-and-network',
        },
    },
});
