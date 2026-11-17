"use client";

import { useEffect, useRef } from "react";

type Props = {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Si se pasa, Enter llama a esta función (y limpia el campo) en vez de enviar el formulario.
   * Sin ella, Enter envía el formulario que contiene al campo (búsqueda normal).
   */
  onScan?: (code: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
};

/**
 * Campo de búsqueda / escaneo.
 *
 * Los lectores de código de barras USB o Bluetooth funcionan como un teclado:
 * "escriben" el código muy rápido y al final mandan Enter. Por eso basta con un
 * campo que tenga el foco y reaccione a Enter; no se necesita instalar nada.
 *
 * - Toma el foco al abrir la página (autoFocus).
 * - F2 o "/" desde cualquier parte de la página vuelven a enfocarlo.
 * - Al enfocarlo se selecciona el texto, así el siguiente escaneo lo reemplaza.
 */
export function ScanInput({ name = "q", defaultValue, placeholder, autoFocus = true, onScan, inputRef, className }: Props) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable]");
      if (e.key === "F2" || (e.key === "/" && !typing)) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
        <BarcodeIcon />
      </span>
      <input
        ref={ref}
        name={name}
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder ?? "Escanea o escribe nombre, SKU o código"}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onScan) {
            e.preventDefault();
            const value = e.currentTarget.value.trim();
            if (value) onScan(value);
          }
        }}
        className="input pl-10"
        aria-label="Buscar o escanear código"
        title="Atajo: F2 o /"
      />
    </div>
  );
}

function BarcodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" />
    </svg>
  );
}
