import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <s-page heading="Unmanual">
      <s-button slot="primary-action" variant="primary" href="/product-export">
        Export products
      </s-button>
      <s-button
        slot="secondary-actions"
        variant="secondary"
        href="/product-description"
      >
        Review descriptions
      </s-button>
      <s-button slot="secondary-actions" variant="secondary" href="/settings">
        Settings
      </s-button>

      <s-banner tone="info">
        Product export and description workflows are ready for Shopify app
        testing.
      </s-banner>

      <s-section heading="Setup guide">
        <s-box border="base" borderRadius="base" background="base">
          <s-box padding="base">
            <s-checkbox
              label="Connect Shopify authorization"
              checked
            ></s-checkbox>
          </s-box>
          <s-divider></s-divider>
          <s-box padding="base">
            <s-checkbox label="Review product description defaults"></s-checkbox>
          </s-box>
          <s-divider></s-divider>
          <s-box padding="base">
            <s-checkbox label="Export your first product catalog"></s-checkbox>
          </s-box>
        </s-box>
      </s-section>

      <s-section heading="Overview">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 640px) 1fr, 1fr auto 1fr auto 1fr"
          gap="base"
        >
          <s-clickable href="/product-export" padding="base">
            <s-heading>Products ready</s-heading>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>24</s-text>
              <s-badge tone="success">Synced</s-badge>
            </s-stack>
          </s-clickable>
          <s-divider direction="block"></s-divider>
          <s-clickable href="/product-description" padding="base">
            <s-heading>Descriptions</s-heading>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>8</s-text>
              <s-badge tone="warning">Need review</s-badge>
            </s-stack>
          </s-clickable>
          <s-divider direction="block"></s-divider>
          <s-clickable href="/settings" padding="base">
            <s-heading>Automation</s-heading>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text>On</s-text>
              <s-badge tone="success">Active</s-badge>
            </s-stack>
          </s-clickable>
        </s-grid>
      </s-section>

      <s-section heading="Needs attention">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Workflow</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Next step</s-table-header>
          </s-table-header-row>
          <s-table-body>
            <s-table-row>
              <s-table-cell>
                <s-link href="/product-description">Description review</s-link>
              </s-table-cell>
              <s-table-cell>
                <s-badge tone="warning">Review</s-badge>
              </s-table-cell>
              <s-table-cell>Approve generated descriptions</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>
                <s-link href="/product-export">Product export</s-link>
              </s-table-cell>
              <s-table-cell>
                <s-badge tone="success">Ready</s-badge>
              </s-table-cell>
              <s-table-cell>Download the latest catalog</s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}
