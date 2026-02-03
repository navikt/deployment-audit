import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [],
  framework: '@storybook/react-vite',
  staticDirs: ['../public'],
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: '.storybook/vite.config.ts',
      },
    },
  },
};

export default config;