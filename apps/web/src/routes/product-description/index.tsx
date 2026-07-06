import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Empty } from "@/components/empty";

export const Route = createFileRoute("/product-description/")({
  component: ProductExport,
});

const EXPORT_ACTION_DELAY_MS = 500;

const exportActionRows = [
  {
    createdAt: "Today",
    fileName: "summer-catalog.csv",
    id: "summer-catalog",
    name: "Summer catalog",
    status: "Ready",
    tone: "success",
  },
  {
    createdAt: "Yesterday",
    fileName: "price-review.csv",
    id: "price-review",
    name: "Price review",
    status: "Processing",
    tone: "info",
  },
  {
    createdAt: "Last week",
    fileName: "archive-export.csv",
    id: "archive-export",
    name: "Archive export",
    status: "Failed",
    tone: "critical",
  },
] as const;

type ExportActionRow = (typeof exportActionRows)[number];

function ProductExport() {
  const [rows, setRows] = useState<ExportActionRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setRows([...exportActionRows]);
      setStatus("ready");
    }, EXPORT_ACTION_DELAY_MS);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, []);

  return (
    <s-page heading="Product Description">
      <s-button
        href="/product-description/new"
        slot="primary-action"
        variant="primary"
      >
        Create
      </s-button>

      {status === "loading" ? (
        <s-section>
          <s-spinner
            accessibilityLabel="Loading product description actions"
            size="base"
          ></s-spinner>
        </s-section>
      ) : rows.length === 0 ? (
        <Empty
          heading="No export actions"
          message="Create an export action to upload and process a product description file."
          scope="inline"
        />
      ) : (
        <s-section
          padding="none"
          accessibilityLabel="Product description actions"
        >
          <s-table>
            <s-grid
              slot="filters"
              gap="small-200"
              gridTemplateColumns="1fr auto"
            >
              <s-text-field
                label="Search export actions"
                labelAccessibilityVisibility="exclusive"
                icon="search"
                placeholder="Searching all export actions"
              ></s-text-field>
              <s-button
                icon="sort"
                variant="secondary"
                accessibilityLabel="Sort"
                interestFor="export-actions-sort-tooltip"
                commandFor="export-actions-sort"
              ></s-button>
              <s-tooltip id="export-actions-sort-tooltip">
                <s-text>Sort</s-text>
              </s-tooltip>
              <s-popover id="export-actions-sort">
                <s-stack gap="none">
                  <s-box padding="small">
                    <s-choice-list label="Sort by" name="Sort by">
                      <s-choice value="name" selected>
                        Export action
                      </s-choice>
                      <s-choice value="file">File</s-choice>
                      <s-choice value="created">Created</s-choice>
                      <s-choice value="status">Status</s-choice>
                    </s-choice-list>
                  </s-box>
                  <s-divider></s-divider>
                  <s-box padding="small">
                    <s-choice-list label="Order by" name="Order by">
                      <s-choice value="ascending" selected>
                        A-Z
                      </s-choice>
                      <s-choice value="descending">Z-A</s-choice>
                    </s-choice-list>
                  </s-box>
                </s-stack>
              </s-popover>
            </s-grid>

            <s-table-header-row>
              <s-table-header listSlot="primary">Export action</s-table-header>
              <s-table-header>File</s-table-header>
              <s-table-header>Created</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((row) => (
                <s-table-row clickDelegate={`${row.id}-checkbox`} key={row.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-checkbox id={`${row.id}-checkbox`}></s-checkbox>
                      <s-link href="/product-export/new">{row.name}</s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{row.fileName}</s-table-cell>
                  <s-table-cell>{row.createdAt}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={row.tone}>{row.status}</s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}
