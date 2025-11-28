const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const fs = require('fs');
const path = require('path');
const resolvers = require('./resolvers');

// Load GraphQL schema
const typeDefs = fs.readFileSync(
    path.join(__dirname, 'schema.graphql'),
    'utf-8'
);

// Create Apollo Server
const createApolloServer = () => {
    return new Apollo Server({
        typeDefs,
        resolvers,
        introspection: true, // Enable GraphQL Playground
    });
};

module.exports = { createApolloServer, typeDefs, resolvers };
