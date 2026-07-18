import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type ModelChoice } from "@/lib/api";

/**
 * Which model reasons about the sprint. Shared by Actions and Chat so the two surfaces
 * can't disagree, and the choice is per-workspace — picking here changes the next scan
 * and the next chat turn alike. Only models the deployment has a key for are listed.
 */
export function ModelPicker({ disabled, onChange }: { disabled?: boolean; onChange?: (id: string) => void }) {
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .models()
      .then(({ models, current }) => {
        setModels(models);
        setCurrent(current);
      })
      .catch(() => setModels([]));
  }, []);

  // Nothing to choose between: one model (or none) is not a decision worth a control.
  if (models.length < 2) return null;

  const pick = async (id: string) => {
    const previous = current;
    setCurrent(id); // optimistic — the dropdown must feel instant
    setSaving(true);
    try {
      await api.settings({ model: id });
      onChange?.(id);
    } catch {
      setCurrent(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select value={current} onValueChange={pick} disabled={disabled || saving}>
      <SelectTrigger className="h-8 w-[170px] text-[13px]" aria-label="Model">
        {/* Label only — the note belongs in the menu, not squeezed into the trigger. */}
        <SelectValue placeholder="Model">{models.find((m) => m.id === current)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex flex-col items-start">
              <span>{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.note}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
