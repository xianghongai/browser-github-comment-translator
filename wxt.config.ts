import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/auto-icons'],
  manifest: ({ browser }) => ({
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'en',
    permissions: ['storage'],
    host_permissions: ['https://translate.googleapis.com/*'],
    // AI providers live at user-defined origins; each one is requested from the options page when it is saved.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'github-comment-translator@xianghongai',
              data_collection_permissions: {
                required: ['websiteContent'],
              },
            },
          }
        : undefined,
  }),
});
