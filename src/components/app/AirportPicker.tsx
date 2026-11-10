"use client";

import { useEffect, useId, useState } from "react";

type Place = { label: string; city: string; country: string; iata: string };

/**
 * Type any city or airport; suggestions come from the live airport database.
 * The value is "City, Country (IATA)", which the planner reads as the origin.
 */
export function AirportPicker({ value, onChange, name }: { value: string; onChange: (value: string) => void; name?: string }) {
  const listId = useId();
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    const query = value.replace(/\s*\([A-Z]{3}\).*$/, "").split(",")[0].trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body: { places?: Place[] }) => setPlaces(body.places ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <>
      <input
        name={name}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="City or airport, e.g. Tokyo"
        autoComplete="off"
      />
      <datalist id={listId}>
        {places.map((place) => (
          <option key={place.iata} value={place.label.split(" · ")[0]}>
            {place.label}
          </option>
        ))}
      </datalist>
    </>
  );
}
