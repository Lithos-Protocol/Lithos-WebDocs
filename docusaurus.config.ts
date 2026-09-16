// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import type * as Plugin from "@docusaurus/types/src/plugin";
import type * as OpenApiPlugin from "docusaurus-plugin-openapi-docs";

const config: Config = {
  title: "Lithos Client",
  tagline: "Docs & REST API",
  // The Lithos Client serves this build itself, from `public/` at /assets, so the
  // canonical origin is whatever host runs the client. Change both if you deploy
  // the site somewhere else.
  url: "http://localhost:9000",
  baseUrl: "/assets",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.ico",

  organizationName: "Lithos-Protocol",
  projectName: "Lithos-WebDocs",

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.ts"),
          docItemComponent: "@theme/ApiItem", // Derived from docusaurus-theme-openapi
        },
        // No blog: nothing links to one, and the preset otherwise builds a /blog
        // route plus RSS feeds for posts that do not exist.
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig:
    {
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      docs: {
        sidebar: {
          hideable: true,
        },
      },
      navbar: {
        title: "Lithos",
        logo: {
          alt: "Lithos",
          src: "img/lithos-mark.png",
        },
        items: [
          {
            type: "doc",
            docId: "intro",
            position: "left",
            label: "Information",
          },
          {
            label: "Startup",
            position: "left",
            to: "/docs/startup-intro",
          },
          {
            label: "API",
            position: "left",
            to: "/api",
          },
          {
            label: "LithosDex",
            position: "left",
            to: "/dex",
            className: "navbar__link--dex",
          },
          {
            label: "Collateral",
            position: "left",
            to: "/collateral",
          },
          {
            href: "https://github.com/Lithos-Protocol",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Tutorial",
                to: "/docs/intro",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Telegram",
                href: "https://t.me/LITHOS_Protocol",
              },
              {
                label: "Twitter",
                href: "https://x.com/LithosProtocol",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/Lithos-Protocol",
              }
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} Lithos Protocol`,
      },
      prism: {
        additionalLanguages: [
          "ruby",
          "csharp",
          "php",
          "java",
          "powershell",
          "json",
          "bash",
          "dart",
          "objectivec",
          "r",
        ],
      },
      languageTabs: [
        {
          highlight: "python",
          language: "python",
          logoClass: "python",
        },
        {
          highlight: "bash",
          language: "curl",
          logoClass: "curl",
        },
        {
          highlight: "javascript",
          language: "nodejs",
          logoClass: "nodejs",
        },
        {
          highlight: "javascript",
          language: "javascript",
          logoClass: "javascript",
        }
      ],
    } satisfies Preset.ThemeConfig,

  plugins: [
    [
      "docusaurus-plugin-openapi-docs",
      {
        id: "openapi",
        docsPluginId: "classic",
        config: {
          lithosapi: {
            specPath: "examples/lithosapi.yaml",
            outputDir: "docs/lithosapi",
            downloadUrl:
              "https://raw.githubusercontent.com/Lithos-Protocol/Lithos-WebDocs/main/examples/lithosapi.yaml",
            sidebarOptions: {
              groupPathsBy: "tag",
              categoryLinkSource: "tag",
            },
          } satisfies OpenApiPlugin.Options,
        } satisfies Plugin.PluginOptions,
      },
    ],
  ],

  themes: ["docusaurus-theme-openapi-docs"],
};

export default async function createConfig() {
  return config;
}
