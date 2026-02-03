import type { Preview } from '@storybook/react-vite';
import '@navikt/ds-css';
import { Theme } from '@navikt/ds-react';
import React from 'react';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true,
    },
  },
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [
    (Story, context) => (
      <Theme theme={context.globals.theme}>
        <div style={{ padding: '1rem' }}>
          <Story />
        </div>
      </Theme>
    ),
  ],
};

export default preview;