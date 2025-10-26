"use client";
import React from "react";

type Option = { value: string; label: string };

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
}

export function Select({ value, onChange, options, placeholder, className = "", disabled, id, name }: SelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full rounded-md border border-white/20 bg-white/5 text-white px-3 py-2 pr-8
                   hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/40
                   placeholder-white/50 disabled:opacity-60"
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-slate-900 text-white">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.939l3.71-3.71a.75.75 0 111.06 1.061l-4.24 4.24a.75.75 0 01-1.06 0l-4.24-4.24a.75.75 0 01.02-1.06z" />
      </svg>
    </div>
  );
}

export default Select;

