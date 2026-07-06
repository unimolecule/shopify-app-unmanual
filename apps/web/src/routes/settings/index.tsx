import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
  component: Settings,
});

function Settings() {
  return (
    <form
      data-save-bar
      onReset={(event) => {
        event.currentTarget.reset();
      }}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <s-page heading="Settings" inlineSize="small">
        <s-button slot="primary-action" type="submit" variant="primary">
          Save
        </s-button>
        <s-button slot="secondary-actions" type="reset" variant="secondary">
          Discard
        </s-button>

        <s-section heading="Export defaults">
          <s-select label="Default export format" name="export-format">
            <s-option value="csv">CSV</s-option>
            <s-option value="json">JSON</s-option>
          </s-select>
          <s-text-field
            label="File name prefix"
            name="file-prefix"
            value="shopify-products"
            placeholder="Enter file name prefix"
          ></s-text-field>
          <s-checkbox
            label="Include unpublished products"
            name="include-unpublished"
            value="true"
          ></s-checkbox>
        </s-section>

        <s-section heading="Description generation">
          <s-select label="Default tone" name="description-tone">
            <s-option value="clear">Clear</s-option>
            <s-option value="premium">Premium</s-option>
            <s-option value="playful">Playful</s-option>
          </s-select>
          <s-text-field
            label="Target word count"
            name="description-word-count"
            value="120"
            placeholder="Enter target word count"
          ></s-text-field>
          <s-checkbox
            label="Require review before publishing"
            name="require-review"
            value="true"
            checked
          ></s-checkbox>
        </s-section>

        <s-section heading="Connected account">
          <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
            <s-grid-item>
              <s-stack>
                <s-heading>Shopify app backend</s-heading>
                <s-text color="subdued">Connected through app session</s-text>
              </s-stack>
            </s-grid-item>
            <s-grid-item>
              <s-button variant="secondary">Reconnect</s-button>
            </s-grid-item>
          </s-grid>
        </s-section>
      </s-page>
    </form>
  );
}
