const { getCachedDocumentNodeFromSchema, ClientSideBaseVisitor, DocumentMode } = require("@graphql-codegen/visitor-plugin-common");
const { concatAST, visit, Kind } = require("graphql");
const { pascalCase } = require('change-case-all');
const { extname } = require("path");

const lowerCaseFirstLetter = term => `${term.charAt(0).toLowerCase()}${term.slice(1)}`.replace(/Query$/, '').replace(/Mutation$/, '');

class Visitor extends ClientSideBaseVisitor {
    constructor(schema, fragments, config, documents) {
        super(schema, fragments, config, {
            documentMode: DocumentMode.graphQLTag,
        }, documents);

        this._documents = documents;
        this.__mutationNames = [];
        this.__queryNames = [];
    }

    getImports = () => {
        const baseImports = [
            "import { ApolloClient, QueryOptions, MutationOptions } from '@apollo/client';",
            ...super.getImports()
        ];

        const hasOperations = this._collectedOperations.length > 0;

        return !hasOperations 
            ? baseImports
            : [...baseImports, ...Array.from(this._imports)];
    }

    buildOperation = (node, documentVariableName, operationType, operationResultType, operationVariablesType, hasRequiredVars) => {
        const nodeName = node.name ? node.name.value : '';
        const suffix = pascalCase(operationType);

        const operationName = this.convertName(nodeName, {
            suffix,
            useTypesPrefix: false,
            useTypesSuffix: false,
        });

        const isMutation = operationType === 'Mutation';
        const isQuery = operationType === 'Query';

        if (isMutation && !isQuery) return '';

        const optionsTypeString = isMutation ? 'MutationOptions' : 'QueryOptions';
        const clientAction = isMutation ? 'mutate' : 'query';
        const documentKeyword = isMutation ? 'mutation' : 'query';

        const optionsType = `Omit<${optionsTypeString}<${operationVariablesType}, ${operationResultType}>, ${documentKeyword}>`;

        const variablesStringGenerator = spaces => node.variableDefinitions.reduce((collection, item) => {
            const name = item.variable.name.value;
            return `${collection}\n* ${''.padStart(spaces, '\t')}${name}: // value for ${name}`;
        }, '')

        const ticks = '```';

        const comment = `/** 
* ${clientAction}${operationName}
*
* To execute a ${documentKeyword} against the apollo client simply call this method 
* with a client and pass it any options that you require then await or chain the method call.
*
* @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/core/#ApolloClient.${clientAction}
* 
* @example
* ${ticks}typescript
* try {
*   const data = await ${clientAction}${operationName}(client${!node.variableDefinitions.length ? '' : `, {
*       variables: {${variablesStringGenerator(4)}
*       }
*   }`});
*
*   // proccess data
* } catch (error) {
*   // handle error 
* }
* ${ticks}
*
* @example
* ${ticks}typescript
* const data = ${clientAction}${operationName}(client${!node.variableDefinitions.length ? '' : `, {
*       variables: {${variablesStringGenerator(3)}
*       }
*   }`});
* .then(result => // proccess data)
* .catch(error => // handle error);
* ${ticks}
*/`;

        const body = `${comment}
        export const ${clientAction}${operationName} = (client: ApolloClient<object>, options: ${optionsType}) => {
            return client
                .${clientAction}<${operationResultType}, ${operationVariablesType}>({
                    ...options,
                    ${documentKeyword}: ${documentVariableName}
                })
        }`;

        (isMutation ? this.__mutationNames : this.__queryNames).push({
            name: operationName,
            action: clientAction,
            type: optionsType
        });

        /* TODO: JSDoc comments */

        return body;
    }

    createFactory = () => {
        const queries = this.__queryNames.map(({ name, type, action }) => `${lowerCaseFirstLetter(name)}: (options: ${type}) => ${action}${name}(client, options)`);
        const mutations = this.__mutationNames.map(({ name, type, action }) => `${lowerCaseFirstLetter(name)}: (options: ${type}) => ${action}${name}(client, options)`);

        return `export const graphQlClient = (client: ApolloClient<object>) => ({
            ${ !queries.length ? '' : `query: {
                ${ queries.join('\n\t') }
            },` }
            ${ !mutations.length ? '' : `mutate: {
                ${ mutations.join('\n\t') }
            },` }
        })`;
    }
}

module.exports = {
    plugin: (schema, documents, config) => {
        const ast = concatAST(documents.map(z => z.document));
        // const ast = getCachedDocumentNodeFromSchema(schema);

        const localFragments = ast
            .definitions
            .filter(z => z.kind === Kind.FRAGMENT_DEFINITION)
            .map(z => ({
                node: z,
                name: z.name.value,
                onType: z.typeCondition.value,
                isExternal: false,
            }))

        const fragments = [
            ...localFragments,
            ...(config.externalFragments || [])
        ];

        const operationDefinitions = {
            query: new Set(),
            mutation: new Set(),
            subscription: new Set(),
            fragment: new Set(),
        }

        const enter = {
            OperationDefinition: node => {
                if (node.name && node.name.value) operationDefinitions[node.operation].add(node.name.value);
            }
        }

        const visitor = new Visitor(schema, fragments, config, documents);
        const result = visit(ast, { leave: visitor });

        return {
            prepend: [
                ...visitor.getImports(),
            ],
            content: [
                visitor.fragments,
                ...result.definitions.filter(z => typeof z === 'string'),
                visitor.createFactory()
            ].join('\n')
        };
    },
    validate: async (schema, documents, config, outputFile) => {
        if (config.disableChecks) return;

        const validFileExtensions = ['.ts', '.tsx'];

        if (!validFileExtensions.includes(extname(outputFile))) {
            throw new Error('The output file must be a typescript file ending with either .ts or .tsx');
        }
    }
}
