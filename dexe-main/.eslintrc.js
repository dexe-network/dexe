module.exports = {
  extends: 'google',
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2017,
  },
  rules: {
    indent: [
      'error',
      2,
      {
        CallExpression: {
          arguments: 1,
        },
        FunctionDeclaration: {
          body: 1,
          parameters: 1,
        },
        FunctionExpression: {
          body: 1,
          parameters: 1,
        },
        MemberExpression: 0,
        ObjectExpression: 1,
        SwitchCase: 1,
        ignoredNodes: ['ConditionalExpression'],
      },
    ],
    'require-jsdoc': 0,
    'max-len': [
      2,
      {
        code: 150,
        tabWidth: 2,
        ignoreUrls: true,
        // Mocha tests are calls to function it() with usually long test name.
        ignorePattern: '( it|require|skip)\\(',
      },
    ],
  },
};
