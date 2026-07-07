"use client";

import { cn } from "@/lib/utils";

export type ClaimFilterTab = "all" | "flagged" | "factual";

const TABS: { key: ClaimFilterTab; label: string }[] = [
  { key: "all", label: "All claims" },
  { key: "flagged", label: "Flagged" },
  { key: "factual", label: "Factual" },
];

export function ClaimFilters({
  activeTab,
  onTabChange,
  activeTechnique,
  onTechniqueChange,
  techniques,
}: {
  activeTab: ClaimFilterTab;
  onTabChange: (tab: ClaimFilterTab) => void;
  activeTechnique: string | null;
  onTechniqueChange: (technique: string | null) => void;
  techniques: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onTabChange(t.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeTab === t.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
      {techniques.length > 0 && (
        <>
          <span className="mx-1 text-muted-foreground/50">·</span>
          {techniques.map((tech) => (
            <button
              key={tech}
              type="button"
              onClick={() => onTechniqueChange(activeTechnique === tech ? null : tech)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTechnique === tech
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {tech}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
