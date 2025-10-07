module.exports = {
  root: true,
  extends: [
    '@react-native',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  plugins: ['@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-restricted-imports': ['error', { paths: [{ name: 'expo-file-system', message: 'Use expo-file-system/legacy in this codebase.' }] }],
    'react-hooks/exhaustive-deps': 'warn'
  },
  overrides: [
    { files: ['**/*.js'], rules: { '@typescript-eslint/no-unsafe-member-access': 'off' } }
  ]
};
