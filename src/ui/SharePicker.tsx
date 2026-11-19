/**
 * Auswahl, was ein Kontakt von der eigenen Karte sehen darf:
 * Vorlagen als Standard, einzelne Felder nur auf Wunsch.
 */

import { useState } from 'react';
import { CARD_FIELDS, FIELD_GROUPS, SHARE_PRESETS, matchPreset } from '../model/fields';
import { ADDRESS_CARD_FIELDS, type AddressCard } from '../types';

interface SharePickerProps {
  value: string[];
  onChange: (fields: string[]) => void;
  myCard: AddressCard;
  name?: string;
}

type Choice = string; // Vorlagen-ID, 'all' oder 'custom'

function choiceOf(fields: string[]): Choice {
  const preset = matchPreset(fields);
  if (preset) return preset.id;
  if (fields.length === ADDRESS_CARD_FIELDS.length) return 'all';
  return 'custom';
}

export const SharePicker: React.FC<SharePickerProps> = ({ value, onChange, myCard, name = 'share' }) => {
  const [choice, setChoice] = useState<Choice>(() => choiceOf(value));
  // Gruppen mit Auswahl sind anfangs aufgeklappt; danach entscheidet der Nutzer
  const [initiallyOpen] = useState(
    () => new Set(CARD_FIELDS.filter((field) => value.includes(field.key)).map((field) => field.group))
  );

  const select = (next: Choice) => {
    setChoice(next);
    if (next === 'all') onChange([...ADDRESS_CARD_FIELDS]);
    else if (next !== 'custom') {
      const preset = SHARE_PRESETS.find((p) => p.id === next);
      if (preset) onChange([...preset.fields]);
    }
  };

  const toggle = (field: string) => {
    onChange(value.includes(field) ? value.filter((f) => f !== field) : [...value, field]);
  };

  const options: Array<{ id: Choice; label: string; description: string }> = [
    ...SHARE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label, description: preset.description })),
    { id: 'all', label: 'Alles', description: 'Alle Angaben deiner Karte' },
    { id: 'custom', label: 'Eigene Auswahl', description: 'Einzelne Angaben selbst auswählen' },
  ];

  return (
    <div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="visually-hidden">Vorlage für die Freigabe</legend>
        <div className="options">
          {options.map((option) => (
            <label className="option" key={option.id}>
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={choice === option.id}
                onChange={() => select(option.id)}
                aria-labelledby={`${name}-${option.id}-title`}
                aria-describedby={`${name}-${option.id}-desc`}
              />
              <span className="option-text">
                <span className="option-title" id={`${name}-${option.id}-title`}>
                  {option.label}
                </span>
                <span className="option-desc" id={`${name}-${option.id}-desc`}>
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {choice === 'custom' && (
        <div className="section">
          <h3 className="section-title">Einzelne Angaben</h3>
          {FIELD_GROUPS.map((group) => {
            const fields = CARD_FIELDS.filter((field) => field.group === group.id);
            const selected = fields.filter((field) => value.includes(field.key)).length;
            return (
              <details className="group" key={group.id} open={initiallyOpen.has(group.id) || undefined}>
                <summary>
                  {group.label}
                  <span className="group-count">
                    {selected} von {fields.length}
                  </span>
                </summary>
                <div className="group-body">
                  {fields.map((field) => (
                    <label className="option" key={field.key}>
                      <input
                        type="checkbox"
                        checked={value.includes(field.key)}
                        onChange={() => toggle(field.key)}
                        aria-labelledby={`${name}-field-${field.key}-title`}
                        aria-describedby={`${name}-field-${field.key}-desc`}
                      />
                      <span className="option-text">
                        <span className="option-title" id={`${name}-field-${field.key}-title`}>
                          {field.label}
                        </span>
                        <span className="option-desc" id={`${name}-field-${field.key}-desc`}>
                          {myCard[field.key] || 'noch nicht ausgefüllt'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
