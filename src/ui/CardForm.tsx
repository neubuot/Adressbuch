/**
 * Formular für eine Karte: die wichtigsten Felder sofort, alles Weitere
 * in aufklappbaren Gruppen.
 */

import { CARD_FIELDS, FIELD_GROUPS, type FieldDef } from '../model/fields';
import type { AddressCardField, RemoteCard } from '../types';

interface CardFormProps {
  values: RemoteCard;
  onChange: (field: AddressCardField, value: string) => void;
  idPrefix?: string;
}

const SPAN_2: AddressCardField[] = ['emailPrivate', 'emailWork', 'website', 'organization'];

export const CardForm: React.FC<CardFormProps> = ({ values, onChange, idPrefix = '' }) => {
  const renderField = (field: FieldDef<AddressCardField>) => {
    const id = idPrefix + field.key;
    return (
      <div className={`field${SPAN_2.includes(field.key) ? ' span-2' : ''}`} key={field.key}>
        <label className="field-label" htmlFor={id}>
          {field.label}
        </label>
        <input
          className="input"
          id={id}
          name={field.key}
          type={field.input === 'textarea' ? 'text' : field.input}
          inputMode={field.input === 'tel' ? 'tel' : field.input === 'email' ? 'email' : undefined}
          autoComplete={field.autoComplete ?? 'off'}
          autoCapitalize={field.input === 'email' || field.input === 'url' ? 'none' : undefined}
          maxLength={field.key === 'country' ? 2 : 200}
          value={values[field.key] ?? ''}
          aria-describedby={field.hint ? `${id}-hint` : undefined}
          onChange={(event) =>
            onChange(
              field.key,
              field.key === 'country' ? event.target.value.toUpperCase() : event.target.value
            )
          }
        />
        {field.hint && (
          <span className="field-hint" id={`${id}-hint`}>
            {field.hint}
          </span>
        )}
      </div>
    );
  };

  const essentials = CARD_FIELDS.filter((field) => field.essential);

  return (
    <>
      <div className="form-grid">{essentials.map(renderField)}</div>

      <div className="section">
        <h3 className="section-title">Weitere Angaben</h3>
        {FIELD_GROUPS.map((group) => {
          const fields = CARD_FIELDS.filter((field) => field.group === group.id && !field.essential);
          if (fields.length === 0) return null;
          const filled = fields.filter((field) => (values[field.key] ?? '') !== '').length;
          return (
            <details className="group" key={group.id}>
              <summary>
                {group.label}
                <span className="group-count">
                  {filled > 0 ? `${filled} von ${fields.length} ausgefüllt` : 'leer'}
                </span>
              </summary>
              <div className="group-body">
                <div className="form-grid">{fields.map(renderField)}</div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
};
