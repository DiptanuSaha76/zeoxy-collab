export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="glow-orb animate-floaty -left-16 -top-24 size-72"
        style={{ background: "radial-gradient(circle, var(--glow-violet), transparent 70%)" }}
      />
      <div
        className="glow-orb animate-floaty-slow -right-20 top-40 size-64"
        style={{ background: "radial-gradient(circle, var(--glow-cyan), transparent 70%)" }}
      />
      <div
        className="glow-orb bottom-[-6rem] left-1/2 size-72 -translate-x-1/2"
        style={{ background: "radial-gradient(circle, var(--glow-rose), transparent 70%)" }}
      />
    </div>
  );
}
