import { gql } from '@apollo/client/core';

// Board queries
export const GET_BOARD = gql`
  query GetBoard($id: ID!) {
    board(id: $id) {
      id
      name
      boardType
      canvasItems {
        id
        x
        y
        width
        height
        rotation
        domainObjectId
      }
    }
  }
`;

export const GET_BOARDS = gql`
  query GetBoards($type: BoardType) {
    boards(type: $type) {
      id
      name
      boardType
      path
    }
  }
`;

// DomainObject queries
export const GET_DOMAIN_OBJECT = gql`
  query GetDomainObject($id: ID!) {
    domainObject(id: $id) {
      id
      type
      instanceName
      description
      properties
    }
  }
`;

export const GET_DOMAIN_OBJECTS = gql`
  query GetDomainObjects($type: DomainObjectType, $contextId: ID) {
    domainObjects(type: $type, contextId: $contextId) {
      id
      type
      instanceName
      description
      properties
    }
  }
`;

// BoundedContext queries
export const GET_BOUNDED_CONTEXTS = gql`
  query GetBoundedContexts {
    boundedContexts {
      id
      name
      description
    }
  }
`;

// CanvasItem mutations
export const UPDATE_CANVAS_ITEM_POSITION = gql`
  mutation UpdateCanvasItemPosition($id: ID!, $input: CanvasItemInput!) {
    updateCanvasItemPosition(id: $id, input: $input) {
      id
      x
      y
      width
      height
      rotation
    }
  }
`;

export const CREATE_CANVAS_ITEM = gql`
  mutation CreateCanvasItem($boardId: ID!, $domainObjectId: ID!, $input: CanvasItemInput!) {
    createCanvasItem(boardId: $boardId, domainObjectId: $domainObjectId, input: $input) {
      id
      x
      y
      width
      height
      rotation
      domainObjectId
    }
  }
`;

export const DELETE_CANVAS_ITEM = gql`
  mutation DeleteCanvasItem($id: ID!) {
    deleteCanvasItem(id: $id)
  }
`;

// DomainObject mutations
export const CREATE_DOMAIN_OBJECT = gql`
  mutation CreateDomainObject($input: DomainObjectInput!) {
    createDomainObject(input: $input) {
      id
      type
      instanceName
      description
      properties
    }
  }
`;

export const UPDATE_DOMAIN_OBJECT = gql`
  mutation UpdateDomainObject($id: ID!, $input: DomainObjectInput!) {
    updateDomainObject(id: $id, input: $input) {
      id
      type
      instanceName
      description
      properties
    }
  }
`;

export const DELETE_DOMAIN_OBJECT = gql`
  mutation DeleteDomainObject($id: ID!) {
    deleteDomainObject(id: $id)
  }
`;

export const LINK_DOMAIN_OBJECTS = gql`
  mutation LinkDomainObjects($fromId: ID!, $toId: ID!, $relationType: String!) {
    linkDomainObjects(fromId: $fromId, toId: $toId, relationType: $relationType)
  }
`;

// BoundedContext mutations
export const CREATE_BOUNDED_CONTEXT = gql`
  mutation CreateBoundedContext($input: BoundedContextInput!) {
    createBoundedContext(input: $input) {
      id
      name
      description
    }
  }
`;

export const UPDATE_BOUNDED_CONTEXT = gql`
  mutation UpdateBoundedContext($id: ID!, $input: BoundedContextInput!) {
    updateBoundedContext(id: $id, input: $input) {
      id
      name
      description
    }
  }
`;

export const DELETE_BOUNDED_CONTEXT = gql`
  mutation DeleteBoundedContext($id: ID!) {
    deleteBoundedContext(id: $id)
  }
`;
