module.exports = {
    env: {
        commonjs: false,
        node: true,
    },
    extends: [
        'airbnb-base',
        'airbnb-typescript/base',
        'plugin:@typescript-eslint/recommended',
        'plugin:promise/recommended',
        'prettier',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        tsconfigRootDir: __dirname,
        sourceType: 'module',
        project: `${__dirname}/tsconfig.eslint.json`,
    },
    plugins: ['@typescript-eslint', 'promise', 'import', 'prettier'],
    rules: {
        'prettier/prettier': 'error',
        'import/prefer-default-export': 'off',
        'import/no-default-export': 'off',
        'import/no-dynamic-require': 'off',
        'class-methods-use-this': 'off',
        'no-console': 'off',
        'no-use-before-define': [
            'error',
            {
                functions: false,
                classes: true,
                variables: true,
            },
        ],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-use-before-define': [
            'error',
            {
                functions: false,
                classes: true,
                variables: true,
                typedefs: true,
            },
        ],
        'import/no-extraneous-dependencies': 'off',
        // 'no-console': 'off',
        'promise/no-callback-in-promise': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'array-callback-return': 'off',
        'prefer-promise-reject-errors': 'off',
        'no-empty-pattern': 'off',
        'promise/always-return': 'off',
        'eslint-disable no-plusplus': 'off',
        'no-underscore-dangle': 'off',
    },
    settings: {
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true,
                project: `${__dirname}/tsconfig.json`,
            },
        },
    },
};
