import { EmbeddedFooter } from "./footer";
import { EmbeddedMain } from "./main";
import { EmbeddedSider } from "./sider";

export function EmbeddedLayout() {
  return (
    <section className="embedded flex h-full flex-col">
      <aside className="embedded-sider">
        <EmbeddedSider />
      </aside>
      <main className="embedded-main flex-1">
        <EmbeddedMain />
      </main>
      <footer className="embedded-footer">
        <EmbeddedFooter />
      </footer>
    </section>
  );
}
