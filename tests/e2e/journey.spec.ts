import { test, expect } from "@playwright/test";
test("search, compare another time, and show the data table", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("모든 노선·소요시간은 Mock 데이터", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("가는 날").fill("2026-09-18");
  await page.getByLabel("출발시간", { exact: true }).fill("17:00");
  await page.getByRole("button", { name: "도착시간 확인" }).click();
  await expect(page.getByTestId("arrival-time")).toContainText("19:08");
  await expect(page.getByTestId("duration")).toHaveText("2시간 8분");
  await page
    .getByRole("button", { name: "18:00 출발, 2시간 17분", exact: true })
    .click();
  await expect(page.getByTestId("arrival-time")).toContainText("20:17");
  await expect(page.getByLabel("출발시간", { exact: true })).toHaveValue(
    "18:00",
  );
  await page.getByText("시간별 결과를 표로 보기").click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(errors).toEqual([]);
});
test("rejects same-city route, swaps stops, and handles next-day arrival", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("도착지", { exact: true }).selectOption("청주");
  await page.getByRole("button", { name: "도착시간 확인" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "다르게" }),
  ).toContainText("다르게");
  await page.getByLabel("도착지", { exact: true }).selectOption("서울");
  await page.getByRole("button", { name: "출발지와 도착지 바꾸기" }).click();
  await expect(page.getByLabel("출발지", { exact: true })).toHaveValue("서울");
  await page.getByLabel("가는 날").fill("2026-12-31");
  await page.getByLabel("출발시간", { exact: true }).fill("23:30");
  await page.getByRole("button", { name: "도착시간 확인" }).click();
  await expect(page.getByTestId("arrival-time")).toHaveText("01:05+1일");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
