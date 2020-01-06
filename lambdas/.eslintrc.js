module.exports = {
    extends: ['airbnb', 'prettier'],
    plugins: ['prettier'],
    env: {
        node: true,
        es6: true
    },
    rules: {
        'prettier/prettier': ['error'],
    },
};
