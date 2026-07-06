import { StandaloneMain } from "./main";

export function StandaloneLayout() {
  return (
    <section className="standalone flex h-full flex-col">
      <aside className="standalone-sider"></aside>
      <main className="standalone-main flex-1">
        <StandaloneMain />
      </main>
      <footer className="standalone-footer"></footer>
    </section>
  );
}
