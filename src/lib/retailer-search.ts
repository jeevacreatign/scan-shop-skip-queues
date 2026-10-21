export function validateRetailerSearch(search: Record<string, unknown>) {
  return {
    portal: search["portal"] === "1" || search["portal"] === 1 || search["portal"] === true,
  };
}
