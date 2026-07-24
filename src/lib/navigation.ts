export function parseAppNavigation<T extends string>(
  search: string,
  validTabs: readonly T[],
  fallbackTab: T,
) {
  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const tab = requestedTab && validTabs.includes(requestedTab as T)
    ? requestedTab as T
    : fallbackTab;

  return {
    tab,
    profileStaffId: params.get("staff")?.trim() ?? "",
  };
}

export function buildAppNavigationSearch(
  currentSearch: string,
  tab: string,
  profileStaffId: string,
  fallbackTab: string,
) {
  const params = new URLSearchParams(currentSearch);

  if (tab === fallbackTab) {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }

  if (tab === "profiles" && profileStaffId) {
    params.set("staff", profileStaffId);
  } else {
    params.delete("staff");
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}
