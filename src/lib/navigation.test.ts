import { describe, expect, it } from "vitest";
import { buildAppNavigationSearch, parseAppNavigation } from "./navigation";

const tabs = ["daily", "profiles", "staff"] as const;

describe("ekran URL durumu", () => {
  it("profil ekranını ve seçili personeli yenileme için URL'den okur", () => {
    expect(parseAppNavigation(
      "?tab=profiles&staff=personel-42",
      tabs,
      "daily",
    )).toEqual({
      tab: "profiles",
      profileStaffId: "personel-42",
    });
  });

  it("profil ekranı ve personel seçimini URL'ye yazar", () => {
    expect(buildAppNavigationSearch(
      "",
      "profiles",
      "personel-42",
      "daily",
    )).toBe("?tab=profiles&staff=personel-42");
  });

  it("geçersiz ekran değerinde günlük kayıt ekranına döner", () => {
    expect(parseAppNavigation(
      "?tab=bilinmeyen",
      tabs,
      "daily",
    ).tab).toBe("daily");
  });
});
