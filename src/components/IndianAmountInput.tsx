import React, { useEffect, useRef, useState } from 'react';
import { formatIndianNumberInput } from '../utils/formatters';

interface IndianAmountInputProps {
  value: string | number | null | undefined;
  onValueChange: (rawValue: string) => void;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  id?: string;
  'aria-label'?: string;
}

/** Money input: Indian digit grouping while editing and when blurred; raw values stay ungrouped. */
export const IndianAmountInput: React.FC<IndianAmountInputProps> = ({
  value, onValueChange, className, min, max, step = 'any', required, disabled, placeholder, name, id, 'aria-label': ariaLabel,
}) => {
  const [focused, setFocused] = useState(false);
  const rawValue = String(value ?? '');
  const [draft, setDraft] = useState(rawValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDigitCaret = useRef<{ digitsBefore: number; afterDecimal: boolean; digitsAfter: number } | null>(null);

  useEffect(() => { if (!focused) setDraft(rawValue); }, [rawValue, focused]);
  useEffect(() => {
    if (!focused || pendingDigitCaret.current === null || !inputRef.current) return;
    const target = pendingDigitCaret.current;
    const text = inputRef.current.value;
    let pos = 0;
    if (target.afterDecimal) {
      const decimalAt = text.indexOf('.');
      if (decimalAt >= 0) {
        pos = decimalAt + 1;
        let seenAfter = 0;
        while (pos < text.length && seenAfter < target.digitsAfter) {
          if (/\d/.test(text[pos])) seenAfter++;
          pos++;
        }
      } else pos = text.length;
    } else {
      let seen = 0;
      pos = target.digitsBefore === 0 ? 0 : text.length;
      for (let i = 0; target.digitsBefore > 0 && i < text.length; i++) {
        if (/\d/.test(text[i])) seen++;
        if (seen >= target.digitsBefore) { pos = i + 1; break; }
      }
    }
    inputRef.current.setSelectionRange(pos, pos);
    pendingDigitCaret.current = null;
  }, [draft, focused]);

  const sanitize = (input: string) => {
    let next = input.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
    const negative = next.startsWith('-');
    next = next.replace(/-/g, '');
    const dot = next.indexOf('.');
    if (dot >= 0) next = next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, '');
    return `${negative ? '-' : ''}${next}`;
  };

  const validateRange = (candidate: string) => {
    const input = inputRef.current;
    if (!input) return;
    const n = candidate.trim() === '' ? NaN : Number(candidate);
    const minimum = min === undefined || min === '' ? undefined : Number(min);
    const maximum = max === undefined || max === '' ? undefined : Number(max);
    let message = '';
    if (required && candidate.trim() === '') message = 'Please enter an amount.';
    else if (candidate.trim() !== '' && !Number.isFinite(n)) message = 'Enter a valid amount.';
    else if (Number.isFinite(n) && minimum !== undefined && n < minimum) message = `Amount must be at least ${minimum}.`;
    else if (Number.isFinite(n) && maximum !== undefined && n > maximum) message = `Amount must not exceed ${maximum}.`;
    input.setCustomValidity(message);
  };

  const formatLive = (input: string) => {
    if (!input || input === '-' || input === '.' || input === '-.') return input;
    const negative = input.startsWith('-');
    const unsigned = negative ? input.slice(1) : input;
    const [whole = '', fraction] = unsigned.split('.');
    const lastThree = whole.slice(-3);
    const preceding = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    const integer = preceding ? `${preceding},${lastThree}` : lastThree;
    return `${negative ? '-' : ''}${integer}${fraction !== undefined ? `.${fraction}` : ''}`;
  };
  const shownValue = focused ? formatLive(draft) : formatIndianNumberInput(rawValue);
  return <input
    ref={inputRef}
    id={id}
    name={name}
    aria-label={ariaLabel}
    type="text"
    inputMode="decimal"
    autoComplete="off"
    value={shownValue}
    required={required}
    disabled={disabled}
    placeholder={placeholder}
    className={className}
    onFocus={() => { setFocused(true); setDraft(rawValue); inputRef.current?.setCustomValidity(''); }}
    onChange={(event) => {
      const beforeCaret = event.target.value.slice(0, event.currentTarget.selectionStart ?? event.target.value.length);
      const decimalIndex = beforeCaret.indexOf('.');
      pendingDigitCaret.current = {
        digitsBefore: ((decimalIndex >= 0 ? beforeCaret.slice(0, decimalIndex) : beforeCaret).replace(/,/g, '').match(/\d/g) || []).length,
        afterDecimal: decimalIndex >= 0,
        digitsAfter: decimalIndex >= 0 ? ((beforeCaret.slice(decimalIndex + 1).replace(/,/g, '').match(/\d/g)) || []).length : 0,
      };
      const next = sanitize(event.target.value);
      setDraft(next);
      inputRef.current?.setCustomValidity('');
      onValueChange(next);
    }}
    onBlur={() => {
      validateRange(draft);
      setFocused(false);
      setDraft(rawValue);
    }}
    data-min={min}
    data-max={max}
    data-step={step}
  />;
};
