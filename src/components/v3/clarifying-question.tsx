import { Button } from "@/components/v3/button";

// Figma node 5:185: an inline multiple-choice question in the thread — a
// bordered white card with a question, option buttons, and a caption
// naming the agent's working assumption while it waits.
export function ClarifyingQuestion({
  question,
  options,
  selected,
  assumption,
  onSelect,
}: {
  question: string;
  options: string[];
  /** The option currently shown as the primary (selected/assumed) choice. */
  selected?: string;
  /** Caption naming what the agent assumes while waiting, e.g. "I'm searching the 16th for now." */
  assumption?: string;
  onSelect?: (option: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
      <p className="text-label-l text-[var(--color-text-primary)]">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            variant={option === selected ? "primary" : "secondary"}
            label={option}
            onClick={() => onSelect?.(option)}
          />
        ))}
      </div>
      {assumption && <p className="text-body-s text-[var(--color-text-secondary)]">{assumption}</p>}
    </div>
  );
}
