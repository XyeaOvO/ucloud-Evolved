export function isCourseRoute(url: string = location.href): boolean {
  if (typeof url !== "string") return false;
  return /uclass\/(?:index\.html)?#\//.test(url);
}

export function isNotificationRoute(url: string = location.href): boolean {
  if (typeof url !== "string") return false;
  return url.includes("/set/notice") || url.includes("/notice_fullpage");
}
