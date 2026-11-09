export type MinorUnits = number & { readonly __brand: "MinorUnits" };
export type ZonedDateTime = string & { readonly __brand: "ZonedDateTime" };

export function minorUnits(amount: number): MinorUnits {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("Minor units must be a non-negative safe integer");
  }
  return amount as MinorUnits;
}

export function zonedDateTime(value: string): ZonedDateTime {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) {
    throw new RangeError("Date-time must be a valid ISO timestamp with a timezone");
  }
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== match[1]) {
    throw new RangeError("Date-time must contain a valid calendar date");
  }
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    throw new RangeError("Date-time must contain a valid clock time");
  }
  return value as ZonedDateTime;
}
