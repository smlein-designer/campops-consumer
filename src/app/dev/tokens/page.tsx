// Dev-only check for Build Order stage 1 (Handoff Spec §8.1): every v3
// color primitive, semantic token and text style rendered in one place to
// compare against the Figma Foundations page.
const primitives = [
  ["stone-50", "var(--stone-50)"],
  ["stone-100", "var(--stone-100)"],
  ["stone-200", "var(--stone-200)"],
  ["stone-300", "var(--stone-300)"],
  ["stone-400", "var(--stone-400)"],
  ["stone-600", "var(--stone-600)"],
  ["stone-700", "var(--stone-700)"],
  ["stone-800", "var(--stone-800)"],
  ["ink-900", "var(--ink-900)"],
  ["white", "var(--white)"],
  ["forest-100", "var(--forest-100)"],
  ["forest-600", "var(--forest-600)"],
  ["forest-700", "var(--forest-700)"],
  ["forest-800", "var(--forest-800)"],
  ["forest-900", "var(--forest-900)"],
  ["ember-50", "var(--ember-50)"],
  ["ember-100", "var(--ember-100)"],
  ["ember-300", "var(--ember-300)"],
  ["ember-500", "var(--ember-500)"],
  ["ember-800", "var(--ember-800)"],
  ["lake-100", "var(--lake-100)"],
  ["lake-700", "var(--lake-700)"],
] as const;

const semantics = [
  ["bg-canvas", "var(--v3-bg-canvas)"],
  ["bg-surface", "var(--v3-bg-surface)"],
  ["bg-subtle", "var(--v3-bg-subtle)"],
  ["bg-inverse", "var(--v3-bg-inverse)"],
  ["bg-brand", "var(--v3-bg-brand)"],
  ["bg-held", "var(--v3-bg-held)"],
  ["bg-attention", "var(--v3-bg-attention)"],
  ["bg-attention-strong", "var(--v3-bg-attention-strong)"],
  ["bg-info", "var(--v3-bg-info)"],
  ["bg-control-off", "var(--v3-bg-control-off)"],
  ["text-primary", "var(--v3-text-primary)"],
  ["text-secondary", "var(--v3-text-secondary)"],
  ["text-tertiary", "var(--v3-text-tertiary)"],
  ["text-on-brand", "var(--v3-text-on-brand)"],
  ["text-on-inverse", "var(--v3-text-on-inverse)"],
  ["text-held", "var(--v3-text-held)"],
  ["text-attention", "var(--v3-text-attention)"],
  ["text-info", "var(--v3-text-info)"],
  ["text-link", "var(--v3-text-link)"],
  ["border-default", "var(--v3-border-default)"],
  ["border-strong", "var(--v3-border-strong)"],
  ["border-attention", "var(--v3-border-attention)"],
  ["border-attention-strong", "var(--v3-border-attention-strong)"],
  ["status-working", "var(--v3-status-working)"],
  ["status-attention", "var(--v3-status-attention)"],
] as const;

const typeStyles = [
  ["Display/XL", "text-display-xl"],
  ["Display/L", "text-display-l"],
  ["Heading/L", "text-heading-l"],
  ["Heading/M", "text-heading-m"],
  ["Heading/S", "text-heading-s"],
  ["Price/L", "text-price-l"],
  ["Body/L", "text-body-l"],
  ["Body/M", "text-body-m"],
  ["Body/S", "text-body-s"],
  ["Label/L", "text-label-l"],
  ["Label/M", "text-label-m"],
  ["Label/S", "text-label-s"],
  ["Overline", "text-overline"],
  ["Caption", "text-caption"],
] as const;

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-16 w-full rounded-lg border border-neutral-300"
        style={{ background: value }}
      />
      <span className="text-caption text-neutral-600">{name}</span>
    </div>
  );
}

export default function TokensPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 p-10">
      <h1 className="text-heading-l">v3 Tokens</h1>

      <section className="space-y-3">
        <h2 className="text-heading-s">Color primitives</h2>
        <div className="grid grid-cols-6 gap-4">
          {primitives.map(([name, value]) => (
            <Swatch key={name} name={name} value={value} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading-s">Semantic color</h2>
        <div className="grid grid-cols-6 gap-4">
          {semantics.map(([name, value]) => (
            <Swatch key={name} name={name} value={value} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading-s">Type ramp</h2>
        <div className="space-y-4">
          {typeStyles.map(([label, cls]) => (
            <div key={cls} className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 text-caption text-neutral-600">
                {label}
              </span>
              <span className={cls}>The quick brown fox jumps</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading-s">Radius</h2>
        <div className="flex gap-4">
          {(
            [
              ["sm", "rounded-sm"],
              ["md", "rounded-md"],
              ["lg", "rounded-lg"],
              ["xl", "rounded-xl"],
              ["2xl", "rounded-2xl"],
              ["3xl", "rounded-3xl"],
              ["full", "rounded-full"],
            ] as const
          ).map(([label, cls]) => (
            <div
              key={label}
              className={`h-16 w-16 bg-[var(--forest-600)] ${cls} flex items-center justify-center text-caption text-white`}
            >
              {label}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
