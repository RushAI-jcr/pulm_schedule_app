export function paginateByOffset<T>(items: T[], cursor: string | undefined, limit: number) {
  const parsedOffset = Number(cursor ?? "0");
  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const nextOffset = offset + limit;

  return {
    page: items.slice(offset, nextOffset),
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}
