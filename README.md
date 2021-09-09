# Apollo Client Executor

This is a plugin for [graphl codegen](https://www.graphql-code-generator.com/), it is designed for use with [apollo](https://www.apollographql.com/docs/) in places where hooks cannot be used.

The reason i created this project is because i had a html table which would do things like create modals and fore mutations from cells.  
Due to the way the project was setup everything was passed in as an object keyed by an enum value including the on submit handlers which needed to mutate. 

```typescript
export const config = {
    [Enum.MemberA]: {
        label: 'First',
        modalTitle: 'First',
        onSubmit: data => {
            /* The problem */
        },
    },
    [Enum.MemberB]: {
        label: 'Second',
        modalTitle: 'Second',
        onSubmit: data => {
            /* The problem */
        },
    }
    ...
};
```

This worked very well for the project but due to the rules of hooks they could not be used.
The short term solution was to execute against a apollo client directly which could be done with typesafety however it needed to be done manually.

```typescript
import {GetAllPeopleDocument, MutationType, MutationVariablesType} from './generated.tsx';

const response = await client.query<MutationType, MutationVariablesType>({
    query: GetAllPeopleDocument,
    variables: {
        pageSize: 5
    },
})
```

We already had these really nice typesafe hooks so why couldn't we generate some nice typesafe clients?

Thats what this plugin is designed to do so you get nice typed outputs like this.

```typescript
const response = await queryGetAllPeopleQuery(client, {
    variables: {
        pageSize: 5
    }
})
```

or

```typescript
const response = await graphQlClient(client)
    .query
    .getAllPeople({
        variables: {
            pageSize: 5
        },
    }
```

## Example

`yarn add -D codegen-apollo-client-executor`

Below is an example `codegen.yml`

```yml
schema: "https://swapi-graphql.netlify.app/.netlify/functions/index"
overwrite: true
documents: src/**/*.graphql
generates:
  src/generated/client.tsx:
    - "typescript"
    - "typescript-operations"
    - "codegen-apollo-client-executor"
```
