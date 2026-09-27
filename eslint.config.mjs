// Shared lint config for every app in the monorepo (apps/api now, apps/web later).
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default defineConfig(
  { ignores: ['**/node_modules/', '**/dist/', '**/.next/', '**/coverage/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  // Formatting problems are reported as lint errors, so `npm run lint` checks both.
  prettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
);
