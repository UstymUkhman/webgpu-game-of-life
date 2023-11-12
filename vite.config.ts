import { resolve } from 'path';
import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';
import { version } from './package.json';

export default ({ mode }: { mode: string }) =>
  defineConfig({
    base: './',

    plugins: [glsl()],

    build: { target: 'esnext' },

    resolve: {
      alias: { '@': resolve('src') },
      conditions: ['development', 'browser']
    },

    define: {
      DEBUG: mode !== 'production' && false,
      VERSION: JSON.stringify(version)
    },

    css: {
      modules: {
        localsConvention: 'camelCaseOnly'
      }
    },

    server: {
      host: '0.0.0.0',
      port: 8080,
      open: true
    }
  });
