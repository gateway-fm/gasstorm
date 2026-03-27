export interface NavItem {
  title: string;
  href: string;
  icon?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Quick Start", href: "/docs/getting-started" },
      { title: "Architecture", href: "/docs/architecture" },
      { title: "Configuration", href: "/docs/configuration" },
      { title: "Metal Mode", href: "/docs/metal-mode" },
    ],
  },
  {
    title: "Usage",
    items: [
      { title: "Load Testing", href: "/docs/load-testing" },
      { title: "Cross-Chain Bridging", href: "/docs/bridging" },
      { title: "MCP Integration", href: "/docs/mcp" },
    ],
  },
  {
    title: "Components",
    items: [
      { title: "Block Builder", href: "/docs/block-builder" },
      { title: "Load Generator", href: "/docs/load-generator" },
      { title: "Execution Layers", href: "/docs/execution-layers" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Troubleshooting", href: "/docs/troubleshooting" },
      { title: "Performance", href: "/docs/performance" },
      { title: "Versioning", href: "/docs/versioning" },
    ],
  },
];

export const flatNavItems: NavItem[] = navigation.flatMap(
  (group) => group.items
);
